// 3단계 — 저장된 노트에서 "고칠 점 하나 고르기 → 이 포인트로 다시 연습",
// 그리고 재연습 노트의 "지난 연습" 카드.
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import NoteDetailScreen from "../NoteDetailScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/analyticsService", () => ({ getRelatedNotes: jest.fn(() => []) }));
jest.mock("../../services/aiService", () => ({
  analyzeNote: jest.fn(),
  analyzeVideoFrames: jest.fn(),
  rateFeedback: jest.fn(),
  lastAiMeta: {},
  buildPreviousContext: jest.fn(() => null),
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

  it("후보를 고르면 노트에 chosenFocus가 저장되고 퍼널에 기록된다", () => {
    const ctx = buildCtx([baseNote]);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);

    expect(utils.getByText("focus.pick_title")).toBeTruthy();
    fireEvent.press(utils.getByText("첫 문장 호흡 늦추기"));

    expect(ctx.handleUpdateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 200, chosenFocus: "첫 문장 호흡 늦추기" }),
      { silent: true } // 칩을 누를 때마다 "수정됨" 토스트가 뜨지 않게
    );
    expect(trackFunnelEvent).toHaveBeenCalledWith("focus_selected");
  });

  it("고르기 전엔 '다시 연습' 버튼이 없다", () => {
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    expect(utils.queryByText("focus.repractice_cta")).toBeNull();
  });

  it("'이 포인트로 다시 연습'은 체인(rootNoteId·parentNoteId)과 초점을 들고 새 노트를 연다", () => {
    const chosen = { ...baseNote, chosenFocus: "첫 문장 호흡 늦추기", seriesName: "햄릿" };
    useApp.mockReturnValue(buildCtx([chosen]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);

    fireEvent.press(utils.getByText("focus.repractice_cta"));
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

  it("이미 재연습 노트면 rootNoteId가 체인의 최초 id로 유지된다", () => {
    const chainNote = { ...baseNote, id: 300, rootNoteId: 100, parentNoteId: 200, chosenFocus: "시선 고정" };
    useApp.mockReturnValue(buildCtx([chainNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 300 } }} navigation={navigation} />);
    openAiTab(utils);

    fireEvent.press(utils.getByText("focus.repractice_cta"));
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

  it("직전 노트가 있으면 지난 초점·요약·지표 변화를 보여준다", () => {
    useApp.mockReturnValue(buildCtx([current, prev]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);

    expect(utils.getByText("focus.previous_title")).toBeTruthy();
    expect(utils.getByText("focus.previous_focus: 첫 문장 호흡 늦추기")).toBeTruthy();
    expect(utils.getByText("focus.score_delta")).toBeTruthy();
    // 실력 단정이 아니라 활동 지표의 증감만 — +1 / 0 / -1 형태
    expect(utils.getByText("focus.axis_technique +1 · focus.axis_expression 0 · focus.axis_creativity -1 · focus.axis_consistency 0 · focus.axis_growth +2")).toBeTruthy();
  });

  it("직전 노트가 기기에 없으면 카드를 그리지 않는다 (타기기 복원 등)", () => {
    useApp.mockReturnValue(buildCtx([current]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    expect(utils.queryByText("focus.previous_title")).toBeNull();
  });

  it("재연습이 아닌 일반 노트엔 카드가 없다", () => {
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
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  submitAnonymousMetadata.mockResolvedValue(undefined);
  analyzeNote.mockResolvedValue({ analysis: "새 피드백", scores: null, focusOptions: [] });
  analyzeVideoFrames.mockResolvedValue("새 영상 분석");
  Object.keys(lastAiMeta).forEach((k) => delete lastAiMeta[k]);
};

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

  it("'AI 분석이 아직 없습니다'가 아니라 고칠 점 칩이 보인다", () => {
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

  it("고른 초점이 있으면 '이 포인트로 다시 연습'이 보인다", () => {
    useApp.mockReturnValue(buildCtx([{ ...videoOnly, chosenFocus: "시선 고정" }]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 400 } }} navigation={navigation} />);
    openAiTab(utils);

    fireEvent.press(utils.getByText("focus.repractice_cta"));
    expect(navigation.navigate).toHaveBeenCalledWith("NoteCreate", expect.objectContaining({
      prefill: expect.objectContaining({ focus: "시선 고정", parentNoteId: 400 }),
    }));
  });

  it("글·영상 피드백이 둘 다 없을 때만 빈 상태를 보여준다", () => {
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

  it("편집 중이면 뒤로가기를 막고 확인창을 띄운다", () => {
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

  it("편집 중이 아니면 그냥 나간다", () => {
    const nav = navWithListener();
    useApp.mockReturnValue(buildCtx([baseNote]));
    render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);

    const e = nav.__fire("beforeRemove");
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("저장하고 나가면 확인창이 뜨지 않는다", () => {
    const nav = navWithListener();
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={nav} />);

    fireEvent.press(utils.getByText("✏️"));
    fireEvent.press(utils.getByText("common.save"));
    const e = nav.__fire("beforeRemove");

    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe("항목18 — 피드백 코멘트 모달이 키보드에 가리지 않는다", () => {
  beforeEach(resetDetail);

  it("모달 내용이 KeyboardAvoidingView 안에 들어 있다", () => {
    useApp.mockReturnValue(buildCtx([baseNote]));
    const utils = render(<NoteDetailScreen route={{ params: { noteId: 200 } }} navigation={navigation} />);
    openAiTab(utils);
    fireEvent.press(utils.getByText("👎"));

    expect(utils.getByText("noteDetail.ai_feedback_prompt")).toBeTruthy();
    expect(utils.UNSAFE_getAllByType(KeyboardAvoidingView).length).toBeGreaterThan(0);
  });
});
