// 3단계 — 저장된 노트에서 "고칠 점 하나 고르기 → 이 포인트로 다시 연습",
// 그리고 재연습 노트의 "지난 연습" 카드.
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { usePreventRemove } from "@react-navigation/native";
import NoteDetailScreen from "../NoteDetailScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ usePreventRemove: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/analyticsService", () => ({ getRelatedNotes: jest.fn(() => []) }));
jest.mock("../../services/aiService", () => ({
  analyzeNote: jest.fn(),
  analyzeVideoFrames: jest.fn(),
  rateFeedback: jest.fn(),
  lastAiMeta: {},
  buildPreviousContext: jest.fn(() => null),
  changeSummary: jest.fn((text) => text?.includes("🔁") ? "변화 요약" : ""),
  focusSummary: jest.fn((text) => (text ? `요약:${text.slice(0, 10)}` : "")),
}));
jest.mock("../../services/dataCollectionService", () => ({ submitTrainingData: jest.fn(), submitAnonymousMetadata: jest.fn() }));
jest.mock("../../services/adService", () => ({
  incrementDailyAICount: jest.fn(),
  shouldShowInterstitial: jest.fn(() => false),
  showInterstitialAd: jest.fn(),
  showRewardedAd: jest.fn(),
}));
jest.mock("../../services/apiConfig", () => ({ SERVER_URL: "https://server.test", getApiHeaders: () => ({}) }));
jest.mock("../../services/practiceService", () => ({ aiFeedbackDone: jest.fn(), newUuid: jest.fn(() => "uuid-1") }));
jest.mock("../../utils/accountStorage", () => ({ getStorageScope: () => "test-scope" }));
jest.mock("../../utils/shareCard", () => ({ buildCardProps: jest.fn(() => ({})), shareCardImage: jest.fn() }));
jest.mock("../../components/FeedbackShareCard", () => () => null);
jest.mock("expo-av", () => ({ Audio: { Sound: { createAsync: jest.fn() } }, Video: () => null, ResizeMode: { CONTAIN: "contain" } }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", getInfoAsync: jest.fn(async () => ({ exists: true })) }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const baseNote = {
  id: 200,
  title: "햄릿 독백",
  field: "acting",
  content: "연습함",
  createdAt: new Date().toISOString(),
  aiComment: "📌 인상\n좋다.",
  focusOptions: ["첫 문장 호흡 늦추기", "시선 고정"],
  sceneId: "hamlet-1",
};

const buildCtx = (notes, overrides = {}) => ({
  savedNotes: notes,
  userProfile: { authUserId: "u1" },
  handleDeleteNote: jest.fn(),
  handleToggleStar: jest.fn(),
  handleUpdateNote: jest.fn(),
  showToast: jest.fn(),
  dataConsent: false,
  dataConsentAsked: true,
  handleSetDataConsent: jest.fn(),
  handleDataConsentAsked: jest.fn(),
  aiDisclosureAccepted: true,
  handleAcceptAIDisclosure: jest.fn(),
  isKoreanLocale: true,
  setAuthState: jest.fn(),
  premium: { active: false },
  ...overrides,
});

const openAiTab = (utils) => fireEvent.press(utils.getByText("noteDetail.tab_ai"));

describe("NoteDetailScreen — 고칠 점 고르기 · 다시 연습", () => {
  beforeEach(() => jest.clearAllMocks());

  it("후보를 고르면 노트에 chosenFocus가 저장되고 퍼널에 기록된다", async () => {
    const ctx = buildCtx([baseNote]);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);

    expect(utils.getByText("focus.pick_title")).toBeTruthy();
    await act(async () => { fireEvent.press(utils.getByText("첫 문장 호흡 늦추기")); });

    expect(ctx.handleUpdateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 200, chosenFocus: "첫 문장 호흡 늦추기" }),
      { silent: true } // 칩을 누를 때마다 "수정됨" 토스트가 뜨지 않게
    );
    expect(trackFunnelEvent).toHaveBeenCalledWith("focus_selected");
  });

  it("고르기 전엔 '다시 연습' 버튼이 없다", async () => {
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    expect(utils.queryByText("focus.repractice_cta")).toBeNull();
  });

  it("'이 포인트로 다시 연습'은 체인(rootNoteId·parentNoteId)과 초점을 들고 새 노트를 연다", async () => {
    const chosen = { ...baseNote, chosenFocus: "첫 문장 호흡 늦추기", seriesName: "햄릿" };
    useApp.mockReturnValue(buildCtx([chosen]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);

    await act(async () => { fireEvent.press(utils.getByText("focus.repractice_cta")); });
    expect(trackFunnelEvent).toHaveBeenCalledWith("repractice_started");
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", {
      prefill: {
        title: "햄릿 독백",
        field: "acting",
        seriesName: "햄릿",
        rootNoteId: 200, // 체인의 최초 id — 이 노트가 최초라 자기 자신
        parentNoteId: 200,
        focus: "첫 문장 호흡 늦추기",
        sceneId: "hamlet-1",
      },
    });
  });

  it("이미 재연습 노트면 rootNoteId가 체인의 최초 id로 유지된다", async () => {
    const chainNote = { ...baseNote, id: 300, rootNoteId: 100, parentNoteId: 200, chosenFocus: "시선 고정" };
    useApp.mockReturnValue(buildCtx([chainNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 300 } }} navigation={navigation} />);
    openAiTab(utils);

    await act(async () => { fireEvent.press(utils.getByText("focus.repractice_cta")); });
    const { prefill } = navigation.navigate.mock.calls[0][1];
    expect(prefill.rootNoteId).toBe(100);
    expect(prefill.parentNoteId).toBe(300);
  });
});

describe("NoteDetailScreen — 지난 연습 카드", () => {
  beforeEach(() => jest.clearAllMocks());

  const prev = {
    id: 100,
    title: "햄릿 독백",
    field: "acting",
    createdAt: new Date().toISOString(),
    aiComment: "🎯 개선 포인트\n첫 문장이 빠르다.",
    aiScores: { technique: 5, expression: 5, creativity: 5, consistency: 5, growth: 5 },
    chosenFocus: "첫 문장 호흡 늦추기",
  };
  const current = {
    ...baseNote,
    id: 200,
    parentNoteId: 100,
    rootNoteId: 100,
    focus: "첫 문장 호흡 늦추기",
    aiScores: { technique: 6, expression: 5, creativity: 4, consistency: 5, growth: 7 },
  };

  it("직전 노트가 있으면 지난 초점·요약·지표 변화를 보여준다", async () => {
    useApp.mockReturnValue(buildCtx([current, prev]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);

    expect(utils.getByText("focus.previous_title")).toBeTruthy();
    expect(utils.getByText("focus.previous_focus: 첫 문장 호흡 늦추기")).toBeTruthy();
    expect(utils.getByText("focus.score_delta")).toBeTruthy();
    // 실력 단정이 아니라 활동 지표의 증감만 — +1 / 0 / -1 형태
    expect(utils.getByText("focus.axis_technique +1 · focus.axis_expression 0 · focus.axis_creativity -1 · focus.axis_consistency 0 · focus.axis_growth +2")).toBeTruthy();
  });

  it("직전 노트가 기기에 없으면 카드를 그리지 않는다 (타기기 복원 등)", async () => {
    useApp.mockReturnValue(buildCtx([current]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    expect(utils.queryByText("focus.previous_title")).toBeNull();
  });

  it("재연습이 아닌 일반 노트엔 카드가 없다", async () => {
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    expect(utils.queryByText("focus.previous_title")).toBeNull();
  });
});

// ─── 버그 수정 회귀 테스트 ───

const { KeyboardAvoidingView } = require("react-native");
const { Alert } = require("react-native");
const { analyzeNote, analyzeVideoFrames, lastAiMeta } = require("../../services/aiService");
const { submitAnonymousMetadata } = require("../../services/dataCollectionService");
const { showInterstitialAd, showRewardedAd, incrementDailyAICount, shouldShowInterstitial } = require("../../services/adService");
const { Audio } = require("expo-av");

const resetDetail = () => {
  jest.clearAllMocks();
  require("react-native").AppState.currentState = "active";
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  submitAnonymousMetadata.mockResolvedValue(undefined);
  analyzeNote.mockResolvedValue({ analysis: "새 피드백", scores: null, focusOptions: [] });
  analyzeVideoFrames.mockResolvedValue("새 영상 분석");
  Object.keys(lastAiMeta).forEach((k) => delete lastAiMeta[k]);
};

describe("studio context after saving a note", () => {
  beforeEach(resetDetail);
  const meta = {
    feedbackLanguage: "en", scriptLanguage: "ko",
    rehearsalContext: { sceneTitle: "Scene", role: "Lear", feedbackLanguage: "en", scriptLanguage: "ko" },
    applicationContext: { postId: "casting-1", title: "Application", country: "UK", submissions: ["Self-tape"] },
  };

  it("shows the saved context and uses its language during text reanalysis despite Korean UI", async () => {
    const ctx = buildCtx([{ ...baseNote, ...meta }]);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    expect(utils.getByTestId("studio-context-card")).toBeTruthy();
    expect(utils.getByText("Lear")).toBeTruthy();
    expect(utils.getByText("UK")).toBeTruthy();
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")));
    expect(analyzeNote.mock.calls[0][6]).toEqual(expect.objectContaining(meta));
    expect(ctx.handleUpdateNote.mock.calls[0][0]).toEqual(expect.objectContaining(meta));
  });

  it("uses the saved context for video analysis and the next practice prefill", async () => {
    const note = { ...baseNote, ...meta, chosenFocus: "Wait", images: [{ uri: "file:///take.mov", type: "video", duration: 5000 }] };
    useApp.mockReturnValue(buildCtx([note]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.video_ai_request")));
    expect(analyzeVideoFrames.mock.calls[0][6]).toEqual(expect.objectContaining(meta));
    await act(async () => { fireEvent.press(utils.getByText("focus.repractice_cta")); });
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", { prefill: expect.objectContaining(meta) });
  });
});

describe("항목2 — 영상 AI만 있는 노트에도 고칠 점·재연습이 뜬다", () => {
  beforeEach(resetDetail);

  const videoOnly = {
    id: 400,
    title: "무용 연습",
    field: "dance",
    content: "연습함",
    createdAt: new Date().toISOString(),
    videoAnalysis: "영상 피드백 본문",
    focusOptions: ["무게중심 낮추기", "시선 고정"],
    images: [{ uri: "file:///a.mov", type: "video" }],
  };

  it("'AI 분석이 아직 없습니다'가 아니라 고칠 점 칩이 보인다", async () => {
    const ctx = buildCtx([videoOnly]);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 400 } }} navigation={navigation} />);
    openAiTab(utils);

    expect(utils.queryByText("noteDetail.ai_empty_title")).toBeNull();
    expect(utils.getByText("focus.pick_title")).toBeTruthy();

    fireEvent.press(utils.getByText("무게중심 낮추기"));
    expect(ctx.handleUpdateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 400, chosenFocus: "무게중심 낮추기" }),
      { silent: true }
    );
  });

  it("고른 초점이 있으면 '이 포인트로 다시 연습'이 보인다", async () => {
    useApp.mockReturnValue(buildCtx([{ ...videoOnly, chosenFocus: "시선 고정" }]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 400 } }} navigation={navigation} />);
    openAiTab(utils);

    await act(async () => { fireEvent.press(utils.getByText("focus.repractice_cta")); });
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", expect.objectContaining({
      prefill: expect.objectContaining({ focus: "시선 고정", parentNoteId: 400 }),
    }));
  });

  it("글·영상 피드백이 둘 다 없을 때만 빈 상태를 보여준다", async () => {
    useApp.mockReturnValue(buildCtx([{ ...videoOnly, videoAnalysis: undefined }]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 400 } }} navigation={navigation} />);
    openAiTab(utils);
    expect(utils.getByText("noteDetail.ai_empty_title")).toBeTruthy();
  });
});

describe("항목3 — 재생 중 화면을 나가면 소리가 멈춘다", () => {
  beforeEach(resetDetail);

  it("언마운트 시 재생 중인 sound를 unload한다", async () => {
    useApp.mockReturnValue(buildCtx([{ ...baseNote, voiceRecordings: [{ uri: "file:///a.m4a", duration: 5 }] }]));
    const sound = { playAsync: jest.fn(), unloadAsync: jest.fn(), setOnPlaybackStatusUpdate: jest.fn() };
    Audio.Sound.createAsync.mockResolvedValue({ sound });

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    await act(async () => {
      fireEvent.press(utils.getAllByText("▶️")[0]);
    });
    expect(sound.playAsync).toHaveBeenCalled();

    utils.unmount();
    expect(sound.unloadAsync).toHaveBeenCalled();
  });
});

describe("항목7 — 재분석하면 옛 chosenFocus가 남지 않는다", () => {
  beforeEach(resetDetail);

  const chosen = { ...baseNote, chosenFocus: "첫 문장 호흡 늦추기" };

  it("새 후보에 없으면 chosenFocus를 비운다", async () => {
    const ctx = buildCtx([chosen]);
    useApp.mockReturnValue(ctx);
    analyzeNote.mockResolvedValue({ analysis: "새 피드백", scores: null, focusOptions: ["발음", "속도"] });

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")); });

    const saved = ctx.handleUpdateNote.mock.calls[0][0];
    expect(saved.aiComment).toBe("새 피드백");
    expect(saved.focusOptions).toEqual(["발음", "속도"]);
    expect(saved.chosenFocus).toBeUndefined();
  });

  it("새 후보에도 있으면 선택이 유지된다", async () => {
    const ctx = buildCtx([chosen]);
    useApp.mockReturnValue(ctx);
    analyzeNote.mockResolvedValue({ analysis: "새 피드백", scores: null, focusOptions: ["첫 문장 호흡 늦추기", "속도"] });

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")); });

    expect(ctx.handleUpdateNote.mock.calls[0][0].chosenFocus).toBe("첫 문장 호흡 늦추기");
  });
});

describe("항목12 — 한도 초과 문구가 종류에 맞는다", () => {
  beforeEach(resetDetail);

  it("글 피드백 한도 초과엔 글 문구를 쓴다", async () => {
    useApp.mockReturnValue(buildCtx([{ ...baseNote, aiComment: undefined }]));
    analyzeNote.mockRejectedValue(new Error("AI_QUOTA"));

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.ai_request")); });

    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.text_quota_exceeded")).toBe(true);
    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.video_quota_exceeded")).toBe(false);
  });

  it("영상 분석 한도 초과엔 영상 문구를 쓴다", async () => {
    useApp.mockReturnValue(buildCtx([{ ...baseNote, images: [{ uri: "file:///a.mov", type: "video", duration: 5000 }] }]));
    const err = new Error("video failed");
    err.videoAiReason = "QUOTA";
    analyzeVideoFrames.mockRejectedValue(err);

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.video_ai_request")); });

    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.video_quota_exceeded")).toBe(true);
    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.text_quota_exceeded")).toBe(false);
  });
});

describe("항목16 — 프리미엄에게는 광고를 띄우지 않는다", () => {
  beforeEach(resetDetail);

  it("해외 프리미엄 유저는 전면 광고 없이 재분석된다", async () => {
    useApp.mockReturnValue(buildCtx([baseNote], { isKoreanLocale: false, premium: { active: true } }));
    shouldShowInterstitial.mockReturnValue(true);

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")); });

    expect(showInterstitialAd).not.toHaveBeenCalled();
    expect(incrementDailyAICount).not.toHaveBeenCalled();
    expect(analyzeNote).toHaveBeenCalledTimes(1);
  });

  it("해외 프리미엄 유저는 보상형 광고 없이 영상 분석이 진행된다", async () => {
    useApp.mockReturnValue(buildCtx(
      [{ ...baseNote, images: [{ uri: "file:///a.mov", type: "video", duration: 5000 }] }],
      { isKoreanLocale: false, premium: { active: true } }
    ));

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.video_ai_request")); });

    expect(showRewardedAd).not.toHaveBeenCalled();
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
  });

  it("해외 무료 유저는 예전처럼 보상형 광고를 본다", async () => {
    useApp.mockReturnValue(buildCtx(
      [{ ...baseNote, images: [{ uri: "file:///a.mov", type: "video", duration: 5000 }] }],
      { isKoreanLocale: false, premium: { active: false } }
    ));
    showRewardedAd.mockResolvedValue(true);

    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteDetail.video_ai_request")); });

    expect(showRewardedAd).toHaveBeenCalled();
  });
});

describe("항목17 — 편집 중 하드웨어 뒤로가기도 확인을 받는다", () => {
  beforeEach(resetDetail);

  const navWithListener = () => {
    const listeners = {};
    return {
      navigate: jest.fn(),
      goBack: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn((event, cb) => {
        listeners[event] = cb;
        return jest.fn();
      }),
      __fire: (event) => {
        const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
        listeners[event]?.(e);
        return e;
      },
    };
  };

  it("편집 중이면 뒤로가기를 막고 확인창을 띄운다", async () => {
    const nav = navWithListener();
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);

    fireEvent.press(utils.getByText("✏️")); // 편집 시작
    const e = nav.__fire("beforeRemove");

    expect(e.preventDefault).toHaveBeenCalled();
    const call = Alert.alert.mock.calls.find((c) => c[0] === "noteDetail.edit_cancel_title");
    expect(call).toBeTruthy();

    act(() => { call[2].find((b) => b.text === "noteDetail.discard").onPress(); });
    expect(nav.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
  });

  it("편집 중이 아니면 그냥 나간다", async () => {
    const nav = navWithListener();
    useApp.mockReturnValue(buildCtx([baseNote]));
    render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);

    const e = nav.__fire("beforeRemove");
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("저장하고 나가면 확인창이 뜨지 않는다", async () => {
    const nav = navWithListener();
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);

    fireEvent.press(utils.getByText("✏️"));
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    const e = nav.__fire("beforeRemove");

    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe("항목18 — 피드백 코멘트 모달이 키보드에 가리지 않는다", () => {
  beforeEach(resetDetail);

  it("모달 내용이 KeyboardAvoidingView 안에 들어 있다", async () => {
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    fireEvent.press(utils.getByText("👎"));

    expect(utils.getByText("noteDetail.ai_feedback_prompt")).toBeTruthy();
    expect(utils.UNSAFE_getAllByType(KeyboardAvoidingView).length).toBeGreaterThan(0);
  });
});

describe("completed AI feedback survives a failed local save", () => {
  beforeEach(resetDetail);
  const { aiFeedbackDone } = require("../../services/practiceService");

  it("keeps text feedback visible and retries only the save without consuming another AI request", async () => {
    const ctx = buildCtx([baseNote]);
    ctx.handleUpdateNote.mockRejectedValueOnce(new Error("disk full")).mockRejectedValueOnce(new Error("still full")).mockResolvedValue(undefined);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")));
    expect(utils.getByText("새 피드백")).toBeTruthy();
    expect(utils.getByText("noteDetail.ai_save_pending")).toBeTruthy();
    expect(utils.queryByText("noteDetail.ai_reanalyze")).toBeNull();
    expect(aiFeedbackDone).not.toHaveBeenCalled();
    expect(submitAnonymousMetadata).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(utils.getByText("common.retry_save")));
    expect(utils.getByText("새 피드백")).toBeTruthy();
    await act(async () => fireEvent.press(utils.getByText("common.retry_save")));
    expect(ctx.handleUpdateNote).toHaveBeenCalledTimes(3);
    expect(analyzeNote).toHaveBeenCalledTimes(1);
    expect(aiFeedbackDone).toHaveBeenCalledTimes(1);
    expect(submitAnonymousMetadata).toHaveBeenCalledTimes(1);
    expect(utils.queryByText("common.retry_save")).toBeNull();
  });

  it("retries a failed video save without rerunning the video analysis", async () => {
    const note = { ...baseNote, images: [{ uri: "file:///a.mov", type: "video", duration: 5000 }] };
    const ctx = buildCtx([note]);
    ctx.handleUpdateNote.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.video_ai_request")));
    expect(utils.getByText("새 영상 분석")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled(); // no retry-generation dialog on a storage failure
    await act(async () => fireEvent.press(utils.getByText("common.retry_save")));
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
    expect(ctx.handleUpdateNote).toHaveBeenCalledTimes(2);
    expect(ctx.handleUpdateNote.mock.calls[1][0].videoAnalysis).toBe("새 영상 분석");
    expect(aiFeedbackDone).toHaveBeenCalledTimes(1);
  });

  it("merges the pending AI fields into the latest note rather than reverting intervening edits", async () => {
    const ctx = buildCtx([baseNote]);
    ctx.handleUpdateNote.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    analyzeNote.mockResolvedValue({ analysis: "새 피드백", scores: { growth: 4 }, focusOptions: ["새 초점"] });
    useApp.mockReturnValue(ctx);
    const props = { route: { params: { noteId: 200 } }, navigation };
    const utils = render(<NoteDetailScreen {...props} />);
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")));
    useApp.mockReturnValue({ ...ctx, savedNotes: [{ ...baseNote, title: "수정한 제목", content: "새로 편집한 본문", starred: true, chosenFocus: "새 초점" }] });
    utils.rerender(<NoteDetailScreen {...props} />);
    await act(async () => fireEvent.press(utils.getByText("common.retry_save")));
    expect(ctx.handleUpdateNote.mock.calls[1][0]).toEqual(expect.objectContaining({
      title: "수정한 제목", content: "새로 편집한 본문", starred: true,
      aiComment: "새 피드백", chosenFocus: "새 초점", focusOptions: ["새 초점"],
    }));
  });

  it("guards native back and explicitly warns before discarding the unsaved generated result", async () => {
    const nav = { ...navigation, dispatch: jest.fn() };
    const ctx = buildCtx([baseNote]);
    ctx.handleUpdateNote.mockRejectedValue(new Error("disk full"));
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")));
    const [blocked, onPrevented] = usePreventRemove.mock.calls.at(-1);
    expect(blocked).toBe(true);
    const action = { type: "GO_BACK" };
    act(() => onPrevented({ data: { action } }));
    expect(nav.dispatch).not.toHaveBeenCalled();
    const firstPrompt = Alert.alert.mock.calls.at(-1);
    expect(firstPrompt[1]).toBe("noteDetail.ai_save_leave");
    act(() => firstPrompt[2].find((b) => b.text === "common.cancel").onPress());
    expect(utils.getByText("새 피드백")).toBeTruthy();
    act(() => onPrevented({ data: { action } }));
    act(() => Alert.alert.mock.calls.at(-1)[2].find((b) => b.text === "common.leave").onPress());
    expect(nav.dispatch).toHaveBeenCalledWith(action);
  });
});

describe("1.11.9 — 영상 비교와 재분석 확인", () => {
  beforeEach(resetDetail);
  const previous = { ...baseNote, id: 100, videoAnalysis: "🎯 호흡", images: [{ uri: "file:///old.mp4", type: "video" }] };
  const current = { ...baseNote, id: 200, parentNoteId: 100, focus: "호흡", videoAnalysis: "🔁 호흡 변화", images: [{ uri: "file:///new.mp4", type: "video" }] };

  it("initialTab ai opens the comparison immediately; the content tab does not count a comparison view", async () => {
    useApp.mockReturnValue(buildCtx([current, previous]));
    const props = { navigation, route: { params: { noteId: 200 } } };
    const utils = render(<NoteDetailScreen {...props} />);
    expect(utils.queryByTestId("retake-compare-card")).toBeNull();
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("compare_viewed");
    utils.rerender(<NoteDetailScreen {...props} route={{ params: { noteId: 200, initialTab: "ai" } }} />);
    await act(async () => {});
    expect(utils.getByTestId("retake-compare-card")).toBeTruthy();
    expect(trackFunnelEvent).toHaveBeenCalledWith("compare_viewed");
    await act(async () => { fireEvent.press(utils.getByText("retake.again")); });
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", expect.objectContaining({
      prefill: expect.objectContaining({ parentNoteId: 200, focus: "호흡" }),
    }));
  });

  it("reanalysis uses no credit until confirmed, cancellation is free, and double taps show one prompt", async () => {
    const ctx = buildCtx([current]);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200, initialTab: "ai" } }} navigation={navigation} />);
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
    act(() => Alert.alert.mock.calls.at(-1)[2].find((button) => button.style === "cancel").onPress());
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    await act(async () => Alert.alert.mock.calls.at(-1)[2].find((button) => button.text === "retake.reanalyze_confirm").onPress());
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
    expect(ctx.handleUpdateNote).toHaveBeenCalledWith(expect.objectContaining({ id: 200, videoAnalysis: "새 영상 분석" }));
  });

  it("preflight and saving remain guarded while the confirmation action is tapped twice", async () => {
    let finishFileCheck;
    const { getInfoAsync } = require("expo-file-system/legacy");
    getInfoAsync.mockImplementationOnce(() => new Promise((resolve) => { finishFileCheck = resolve; }));
    useApp.mockReturnValue(buildCtx([current]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200, initialTab: "ai" } }} navigation={navigation} />);
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    const confirm = Alert.alert.mock.calls.at(-1)[2].find((button) => button.text === "retake.reanalyze_confirm").onPress;
    act(() => { confirm(); confirm(); });
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
    await act(async () => finishFileCheck({ exists: true, size: 100 }));
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
  });
});


describe("영상 횟수 캡션", () => {
  beforeEach(resetDetail);
  it.each([[false, "retake.video_trial_remaining"], [true, "retake.video_month_remaining"]])("premium=%s uses the video period", (active, caption) => {
    const note = { ...baseNote, images: [{ uri: "file:///new.mp4", type: "video" }] };
    useApp.mockReturnValue(buildCtx([note], { premium: { active }, usage: { video: { left: 2, max: active ? 15 : 3 } } }));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200, initialTab: "ai" } }} navigation={navigation} />);
    expect(utils.getByText(caption)).toBeTruthy();
    expect(utils.queryByText("quota.remaining_premium")).toBeNull();
  });
});


describe("영상 재분석 소유자와 이전 영상", () => {
  beforeEach(resetDetail);
  const videoNote = { ...baseNote, videoAnalysis: "지난 분석", images: [{ uri: "file:///new.mp4", type: "video" }] };
  const confirmLatest = () => Alert.alert.mock.calls.at(-1)[2].find((button) => button.text === "retake.reanalyze_confirm").onPress();

  it("does not start a paid request when the confirmation belongs to a closed screen", async () => {
    useApp.mockReturnValue(buildCtx([videoNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200, initialTab: "ai" } }} navigation={navigation} />);
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    utils.unmount();
    await act(async () => confirmLatest());
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
  });

  it("stops preflight after the account changes", async () => {
    const { getInfoAsync } = require("expo-file-system/legacy");
    let finishFileCheck;
    getInfoAsync.mockImplementationOnce(() => new Promise((resolve) => { finishFileCheck = resolve; }));
    useApp.mockReturnValue(buildCtx([videoNote]));
    const props = { route: { params: { noteId: 200, initialTab: "ai" } }, navigation };
    const utils = render(<NoteDetailScreen {...props} />);
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    act(() => { confirmLatest(); });
    useApp.mockReturnValue(buildCtx([videoNote], { userProfile: { authUserId: "other-user" } }));
    utils.rerender(<NoteDetailScreen {...props} />);
    await act(async () => finishFileCheck({ exists: true }));
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
  });

  it("uses the previous video feedback instead of text scores or text feedback", async () => {
    const { buildPreviousContext } = require("../../services/aiService");
    const previous = { ...baseNote, id: 100, aiComment: "글의 분석", aiScores: { growth: 4 }, videoAnalysis: "영상의 분석" };
    const current = { ...videoNote, parentNoteId: 100 };
    useApp.mockReturnValue(buildCtx([current, previous]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200, initialTab: "ai" } }} navigation={navigation} />);
    await act(async () => {});
    fireEvent.press(utils.getByText("noteDetail.video_ai_reanalyze"));
    await act(async () => confirmLatest());
    expect(buildPreviousContext).toHaveBeenCalledWith(expect.objectContaining({ videoAnalysis: "영상의 분석", aiComment: undefined, aiScores: undefined }));
  });
});

// 1.11.9 — 저장한 노트에서도 태그·첨부를 하나씩 뺄 수 있다 (전엔 노트를 통째로 지워야 했다)
describe("편집 중 태그·첨부 개별 삭제", () => {
  const note = {
    ...baseNote,
    tags: ["호흡", "시선"],
    images: [{ uri: "file:///a.jpg", type: "image" }, { uri: "file:///b.jpg", type: "image" }],
    voiceRecordings: [{ uri: "file:///r.m4a", duration: 3 }],
    pdfFiles: [{ uri: "file:///s.pdf", name: "대본.pdf" }],
  };
  const open = () => {
    const ctx = buildCtx([note]);
    useApp.mockReturnValue(ctx);
    const view = render(<NoteDetailScreen route={{ params: { noteId: note.id } }} navigation={navigation} />);
    return { ctx, ...view };
  };

  it("편집 전에는 삭제 버튼이 없다", () => {
    const { queryByTestId } = open();
    expect(queryByTestId("remove-tags-0")).toBeNull();
    expect(queryByTestId("remove-images-0")).toBeNull();
  });

  it("×로 뺀 뒤 저장하면 남은 것만 저장된다", async () => {
    const { ctx, getByText, getByTestId } = open();
    fireEvent.press(getByText("\u270F\uFE0F"));
    fireEvent.press(getByTestId("remove-tags-0"));
    fireEvent.press(getByTestId("remove-images-0"));
    fireEvent.press(getByTestId("remove-voiceRecordings-0"));
    await act(async () => { fireEvent.press(getByText("common.save")); });
    expect(ctx.handleUpdateNote).toHaveBeenCalledWith(expect.objectContaining({
      tags: ["시선"],
      images: [{ uri: "file:///b.jpg", type: "image" }],
      voiceRecordings: [],
      pdfFiles: [{ uri: "file:///s.pdf", name: "대본.pdf" }],
    }));
  });

  it("취소하면 아무것도 지워지지 않는다", () => {
    const { ctx, getByText, getByTestId, queryByText } = open();
    fireEvent.press(getByText("\u270F\uFE0F"));
    fireEvent.press(getByTestId("remove-tags-0"));
    expect(queryByText("#호흡")).toBeNull();
    fireEvent.press(getByText("common.cancel"));
    expect(queryByText("#호흡")).toBeTruthy();
    expect(ctx.handleUpdateNote).not.toHaveBeenCalled();
  });
});


describe("표준어 노트 — AI 없이 같은 대사 다시 연습", () => {
  beforeEach(resetDetail);
  const speechNote = {
    id: 410, title: "표준어 대사", field: "acting",
    content: "오늘은 내가 먼저 이야기할게요.",
    practiceMode: "standard_speech", speechLineIndex: 1,
    sceneId: "actraw:ss-001", rootNoteId: 400, parentNoteId: 405,
    scriptLanguage: "ko", feedbackLanguage: "ko",
    createdAt: new Date().toISOString(),
    voiceRecordings: [{ uri: "file:///old-take.m4a", duration: 3000 }],
  };

  it("게스트가 AI 결과·초점 없이 눌러도 대사와 체인을 보존하고 녹음·결과를 가져오지 않는다", async () => {
    useApp.mockReturnValue(buildCtx([speechNote], { userProfile: {} }));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 410 } }} navigation={navigation} />);
    await act(async () => { fireEvent.press(utils.getByText("같은 대사 다시 연습")); });
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", {
      prefill: {
        title: speechNote.title, field: "acting", seriesName: speechNote.title,
        content: speechNote.content, practiceMode: "standard_speech", speechLineIndex: 1,
        sceneId: "actraw:ss-001", rootNoteId: 400, parentNoteId: 410,
        scriptLanguage: "ko", feedbackLanguage: "ko", focus: null,
      },
    });
    expect(trackFunnelEvent).toHaveBeenCalledWith("repractice_started");
    expect(analyzeNote).not.toHaveBeenCalled();
  });

  it("일반 노트 내용 탭에는 새 버튼을 표시하지 않는다", () => {
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    expect(utils.queryByText("같은 대사 다시 연습")).toBeNull();
  });

  it("표준어 노트 편집 중에는 재연습 버튼을 숨긴다", () => {
    useApp.mockReturnValue(buildCtx([speechNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 410 } }} navigation={navigation} />);
    fireEvent.press(utils.getByText("✏️"));
    expect(utils.queryByText("같은 대사 다시 연습")).toBeNull();
  });

  it("영문 사용자는 영어 버튼으로 같은 흐름에 진입한다", async () => {
    useApp.mockReturnValue(buildCtx([speechNote], { isKoreanLocale: false }));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 410 } }} navigation={navigation} />);
    await act(async () => { fireEvent.press(utils.getByText("Practice the same dialogue again")); });
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", expect.objectContaining({ prefill: expect.objectContaining({ practiceMode: "standard_speech" }) }));
  });

  it("AI 결과 저장이 실패해 대기 중이면 내용 탭에서도 재연습을 숨긴다", async () => {
    const ctx = buildCtx([{ ...speechNote, aiComment: "이전 결과" }]);
    ctx.handleUpdateNote.mockRejectedValue(new Error("disk full"));
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 410 } }} navigation={navigation} />);
    openAiTab(utils);
    await act(async () => fireEvent.press(utils.getByText("noteDetail.ai_reanalyze")));
    expect(utils.getByText("noteDetail.ai_save_pending")).toBeTruthy();
    fireEvent.press(utils.getByText("noteDetail.tab_content"));
    expect(utils.queryByText("같은 대사 다시 연습")).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});


describe("상세 노트 음성 재생 소유권", () => {
  const { AppState } = require("react-native");
  let emitState, listeners, nav;
  const note = { ...baseNote, practiceMode: "standard_speech", voiceRecordings: [{ uri: "file:///a.m4a" }, { uri: "file:///b.m4a" }] };
  const deferredSound = () => { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve: v => resolve(v) }; };
  const makeSound = () => ({ playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}), setOnPlaybackStatusUpdate: jest.fn() });
  beforeEach(() => {
    resetDetail(); listeners = {};
    nav = { ...navigation, isFocused: () => true, addListener: (name, fn) => { (listeners[name] ||= []).push(fn); return jest.fn(); } };
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, fn) => { emitState = fn; return { remove: jest.fn() }; });
    useApp.mockReturnValue(buildCtx([note]));
  });
  afterEach(() => AppState.addEventListener.mockRestore());
  const renderNote = () => render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);
  const playFirst = async ui => { await act(async () => { fireEvent.press(ui.getAllByText("▶️")[0]); }); };
  const leave = (kind, ui) => {
    if (kind === "blur") listeners.blur.forEach(fn => fn());
    else if (kind === "account") { useApp.mockReturnValue(buildCtx([note], { userProfile: { authUserId: "other" } })); ui.rerender(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />); }
    else if (kind === "unmount") ui.unmount();
    else emitState(kind);
  };
  it.each(["blur", "background", "inactive", "account", "unmount"])("재생 중 %s일 때 현재 소리를 해제한다", async kind => {
    const sound = makeSound(); Audio.Sound.createAsync.mockResolvedValue({ sound });
    const ui = renderNote(); await playFirst(ui);
    await act(async () => leave(kind, ui));
    expect(sound.unloadAsync).toHaveBeenCalled();
  });
  it.each(["blur", "background", "account", "unmount"])("create 완료 전 %s이면 늦은 음원을 재생하지 않고 해제한다", async kind => {
    const pending = deferredSound(), sound = makeSound(); Audio.Sound.createAsync.mockReturnValue(pending.promise);
    const ui = renderNote(); await playFirst(ui);
    await act(async () => leave(kind, ui));
    await act(async () => pending.resolve({ sound }));
    expect(sound.playAsync).not.toHaveBeenCalled();
    expect(sound.unloadAsync).toHaveBeenCalled();
  });
  it("두번째 음원 준비가 먼저 끝나도 늦은 첫 음원이 덮어쓰지 않는다", async () => {
    const pending = deferredSound(), first = makeSound(), second = makeSound();
    Audio.Sound.createAsync.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ sound: second });
    const ui = renderNote(); await playFirst(ui);
    await act(async () => { fireEvent.press(ui.getAllByText("▶️")[1]); });
    await act(async () => pending.resolve({ sound: first }));
    expect(first.playAsync).not.toHaveBeenCalled(); expect(first.unloadAsync).toHaveBeenCalled();
    expect(second.playAsync).toHaveBeenCalledTimes(1); expect(second.unloadAsync).not.toHaveBeenCalled();
  });
  it("이전 종료 콜백이 새 음원을 정지시키지 않고 같은 음원을 누르면 멈춘다", async () => {
    const first = makeSound(), second = makeSound();
    Audio.Sound.createAsync.mockResolvedValueOnce({ sound: first }).mockResolvedValueOnce({ sound: second });
    const ui = renderNote(); await playFirst(ui);
    const lateFinish = first.setOnPlaybackStatusUpdate.mock.calls[0][0];
    await act(async () => { fireEvent.press(ui.getAllByText("▶️")[0]); });
    await act(async () => lateFinish({ didJustFinish: true }));
    expect(second.unloadAsync).not.toHaveBeenCalled(); expect(ui.getByText("⏸")).toBeTruthy();
    await act(async () => { fireEvent.press(ui.getByText("⏸")); });
    expect(second.unloadAsync).toHaveBeenCalled(); expect(Audio.Sound.createAsync).toHaveBeenCalledTimes(2);
  });
  it("재생 완료 또는 실패한 음원을 해제해 재시도할 수 있다", async () => {
    const first = makeSound(), failed = makeSound(); failed.playAsync.mockRejectedValue(new Error("audio error"));
    Audio.Sound.createAsync.mockResolvedValueOnce({ sound: first }).mockResolvedValueOnce({ sound: failed });
    const ui = renderNote(); await playFirst(ui);
    const finish = first.setOnPlaybackStatusUpdate.mock.calls[0][0];
    await act(async () => finish({ didJustFinish: true }));
    expect(first.unloadAsync).toHaveBeenCalled();
    await playFirst(ui);
    expect(failed.unloadAsync).toHaveBeenCalled(); expect(ui.queryByText("⏸")).toBeNull();
  });
  it("play 완료가 늦어도 blur 이후 새 소리 상태를 복구하지 않는다", async () => {
    const sound = makeSound(), playing = deferredSound(); sound.playAsync.mockReturnValue(playing.promise);
    Audio.Sound.createAsync.mockResolvedValue({ sound });
    const ui = renderNote(); await playFirst(ui);
    await act(async () => leave("blur", ui));
    await act(async () => playing.resolve());
    expect(sound.unloadAsync).toHaveBeenCalled(); expect(ui.queryByText("⏸")).toBeNull();
  });
  it("재연습 화면은 상세 음원 해제를 마친 다음 연다", async () => {
    const sound = makeSound(), unload = deferredSound(); sound.unloadAsync.mockReturnValue(unload.promise);
    Audio.Sound.createAsync.mockResolvedValue({ sound });
    const ui = renderNote(); await playFirst(ui);
    await act(async () => { fireEvent.press(ui.getByText("같은 대사 다시 연습")); });
    expect(nav.navigate).not.toHaveBeenCalled();
    await act(async () => unload.resolve());
    expect(nav.navigate).toHaveBeenCalledWith("NoteCreate", expect.anything());
  });
});
