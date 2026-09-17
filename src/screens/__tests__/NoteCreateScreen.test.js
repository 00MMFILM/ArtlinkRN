import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import NoteCreateScreen from "../NoteCreateScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";
import { hasAskedReminder } from "../../services/reminderService";
import { startPractice, resumePractice, completePractice, aiFeedbackDone } from "../../services/practiceService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/practiceService", () => ({
  startPractice: jest.fn(() => ({ sessionId: "sess-new", kind: "text", subjectKey: null, field: "acting" })),
  resumePractice: jest.fn((sessionId, kind, subjectKey, field) => ({ sessionId, kind, subjectKey, field })),
  completePractice: jest.fn(),
  aiFeedbackDone: jest.fn(),
}));
jest.mock("../../services/aiService", () => ({
  analyzeNote: jest.fn(),
  analyzeVideoFrames: jest.fn(),
  lastAiMeta: {},
  buildPreviousContext: jest.fn((prev) => (prev ? { focus: prev.chosenFocus || null, summary: "지난 요약", scores: prev.aiScores || null } : null)),
}));
jest.mock("../../services/adService", () => ({
  incrementDailyAICount: jest.fn(),
  shouldShowInterstitial: jest.fn(() => false),
  showInterstitialAd: jest.fn(),
  showRewardedAd: jest.fn(),
}));
jest.mock("../../services/reminderService", () => ({
  hasAskedReminder: jest.fn(async () => false),
  markReminderAsked: jest.fn(async () => {}),
  scheduleDailyPracticeReminder: jest.fn(async () => true),
}));
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = {};
  return {
    getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k, v) => { store[k] = v; }),
    removeItem: jest.fn(async (k) => { delete store[k]; }),
    __store: store,
  };
});
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  VideoExportPreset: { Passthrough: 0, MediumQuality: 1 },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-av", () => ({ Audio: { Recording: jest.fn(), Sound: {}, setAudioModeAsync: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1024 })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
}));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
// TopBar의 저장/취소 버튼(left·right prop)을 눌러야 하므로 실제로 렌더한다
jest.mock("../../components/TopBar", () => {
  const React = require("react");
  const RN = require("react-native");
  return ({ left, right }) => React.createElement(RN.View, null, left, right);
});

const { analyzeNote, analyzeVideoFrames } = require("../../services/aiService");
const ImagePicker = require("expo-image-picker");
const VideoThumbnails = require("expo-video-thumbnails");
const AsyncStorage = require("@react-native-async-storage/async-storage");
const { DRAFT_KEY } = require("../../services/noteDraft");

const setAuthState = jest.fn();
const buildCtx = (authUserId, premium = { active: false }) => ({
  handleSaveNote: jest.fn(),
  savedNotes: [],
  userProfile: authUserId ? { authUserId } : {},
  aiDisclosureAccepted: true,
  handleAcceptAIDisclosure: jest.fn(),
  isKoreanLocale: true,
  setAuthState,
  premium,
});

const navigation = { goBack: jest.fn(), navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const runAi = async (utils) => {
  fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "오늘 연습");
  fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
};

const attachVideo = async (utils) => {
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/clip.mov", type: "video", width: 720, height: 1280, duration: 5000 }],
  });
  VideoThumbnails.getThumbnailAsync.mockResolvedValue({ uri: "file:///tmp/thumb.jpg" });
  await act(async () => {
    fireEvent.press(utils.getByText("noteCreate.gallery"));
  });
  await waitFor(() => utils.getByText("noteCreate.video_ai_analyze"));
};

const resetAll = () => {
  jest.clearAllMocks();
  Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  analyzeNote.mockResolvedValue({ analysis: "좋아요", scores: null });
  analyzeVideoFrames.mockResolvedValue("영상 분석 결과");
  hasAskedReminder.mockResolvedValue(false);
};

describe("NoteCreateScreen — 첫 AI 피드백 직후 안내", () => {
  beforeEach(resetAll);

  it("게스트는 첫 AI 성공 후 가입 유도가 딱 1회 뜬다", async () => {
    useApp.mockReturnValue(buildCtx(null));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    expect(Alert.alert.mock.calls[0][0]).toBe("signupNudge.title");
    expect(trackFunnelEvent).toHaveBeenCalledWith("signup_nudge_shown", "ko");
    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_feedback_done", "ko");
    expect(AsyncStorage.__store["artlink-signup-nudge-asked"]).toBe("true");

    // CTA 누르면 인증 화면으로
    const cta = Alert.alert.mock.calls[0][2].find((b) => b.text === "signupNudge.cta");
    await act(async () => { await cta.onPress(); });
    expect(trackFunnelEvent).toHaveBeenCalledWith("signup_nudge_tapped", "ko");
    expect(setAuthState).toHaveBeenCalledWith("auth");

    // 두 번째 AI 성공에는 뜨지 않는다
    Alert.alert.mockClear();
    fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
    await waitFor(() => expect(analyzeNote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("로그인 유저는 가입 유도 대신 연습 리마인더 제안이 뜬다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    expect(Alert.alert.mock.calls[0][0]).toBe("reminder.offer_title");
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("signup_nudge_shown", "ko");
  });
});

describe("항목4 — 글 없이 영상·음성 기록 저장", () => {
  beforeEach(resetAll);

  it("(a) 본문 없이 영상 첨부 + 분석 결과만 있어도 저장된다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    await attachVideo(utils);
    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.video_ai_analyze"));
    });
    await waitFor(() => utils.getByText("noteCreate.video_ai_result"));

    fireEvent.press(utils.getByText("common.save"));

    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
    const noteData = ctx.handleSaveNote.mock.calls[0][0];
    expect(noteData.content).toBe("");
    expect(noteData.videoAnalysis).toBe("영상 분석 결과");
    expect(noteData.images).toHaveLength(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it("(b) 본문·첨부·분석이 전부 비면 저장되지 않고 안내가 뜬다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목만");
    fireEvent.press(utils.getByText("common.save"));

    expect(ctx.handleSaveNote).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("noteCreate.content_required", "noteCreate.content_required_msg");
  });

  it("(c) 첨부가 생기면 기본 제목이 채워지고, 사용자가 제목을 만졌으면 덮어쓰지 않는다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    await attachVideo(utils);
    expect(utils.getByPlaceholderText("noteCreate.title_placeholder").props.value)
      .toBe(`fields.acting ${todayYmd()}`);
  });

  it("(c-2) 사용자가 먼저 제목을 편집하면 기본 제목이 덮어쓰지 않는다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    const titleInput = utils.getByPlaceholderText("noteCreate.title_placeholder");
    fireEvent.changeText(titleInput, "내가 쓴 제목");
    await attachVideo(utils);
    expect(utils.getByPlaceholderText("noteCreate.title_placeholder").props.value).toBe("내가 쓴 제목");

    // 사용자가 제목을 지워도 다시 채우지 않는다 (사용자 의도 존중)
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "");
    await act(async () => {});
    expect(utils.getByPlaceholderText("noteCreate.title_placeholder").props.value).toBe("");
  });
});

describe("항목2 — 가입 왕복 시 초안 보존·복원", () => {
  beforeEach(resetAll);

  it("(a) 가입 CTA를 누르면 초안이 저장된 뒤에 인증 화면으로 간다", async () => {
    useApp.mockReturnValue(buildCtx(null));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    const cta = Alert.alert.mock.calls[0][2].find((b) => b.text === "signupNudge.cta");
    await act(async () => { await cta.onPress(); });

    const saved = JSON.parse(AsyncStorage.__store[DRAFT_KEY]);
    expect(saved.content).toBe("오늘 연습");
    expect(saved.aiComment).toBe("좋아요");
    expect(saved.field).toBe("acting");
    expect(setAuthState).toHaveBeenCalledWith("auth");
  });

  it("(b) 초안 저장에 실패하면 인증 화면으로 가지 않고 안내만 띄운다", async () => {
    useApp.mockReturnValue(buildCtx(null));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    const cta = Alert.alert.mock.calls[0][2].find((b) => b.text === "signupNudge.cta");
    Alert.alert.mockClear();
    AsyncStorage.setItem.mockRejectedValueOnce(new Error("disk full"));

    await act(async () => { await cta.onPress(); });

    expect(setAuthState).not.toHaveBeenCalled();
    expect(AsyncStorage.__store[DRAFT_KEY]).toBeUndefined();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("(c) prefill로 복원하면 첨부·AI 결과가 상태에 들어간다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const draft = {
      title: "복원된 제목",
      content: "",
      field: "music",
      tags: ["독백"],
      seriesName: "햄릿",
      aiComment: "AI 코멘트",
      aiScores: { total: 77 },
      videoAnalysis: "복원된 영상 분석",
      images: [{ uri: "file:///doc/media/a.mov", type: "video" }],
      voiceRecordings: [{ uri: "file:///doc/media/b.m4a", duration: 4 }],
      audioFiles: [{ uri: "file:///doc/media/c.mp3", name: "c.mp3" }],
      pdfFiles: [{ uri: "file:///doc/media/d.pdf", name: "d.pdf" }],
    };
    const utils = render(
      <NoteCreateScreen navigation={navigation} route={{ params: { prefill: draft, restoredDraft: true } }} />
    );

    expect(utils.getByPlaceholderText("noteCreate.title_placeholder").props.value).toBe("복원된 제목");
    expect(utils.getByPlaceholderText("noteCreate.series_placeholder").props.value).toBe("햄릿");
    expect(utils.getByText("복원된 영상 분석")).toBeTruthy();
    expect(utils.getByText("#독백")).toBeTruthy();

    fireEvent.press(utils.getByText("common.save"));
    const noteData = ctx.handleSaveNote.mock.calls[0][0];
    expect(noteData.field).toBe("music");
    expect(noteData.images).toHaveLength(1);
    expect(noteData.voiceRecordings).toHaveLength(1);
    expect(noteData.audioFiles).toHaveLength(1);
    expect(noteData.pdfFiles).toHaveLength(1);
    expect(noteData.aiComment).toBe("AI 코멘트");
    expect(noteData.aiScores).toEqual({ total: 77 });
    // 복원은 열기만 — 저장은 사용자가 누른 이 한 번뿐
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
  });

  it("(d) 저장에 성공하면 보관된 초안이 삭제된다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    AsyncStorage.__store[DRAFT_KEY] = JSON.stringify({ content: "이전 초안", savedAt: 1 });

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    fireEvent.press(utils.getByText("common.save"));

    await waitFor(() => expect(AsyncStorage.__store[DRAFT_KEY]).toBeUndefined());
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
  });

  it("(e) '나가기'로 초안을 버리면 보관된 초안도 삭제된다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    AsyncStorage.__store[DRAFT_KEY] = JSON.stringify({ content: "이전 초안", savedAt: 1 });

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    fireEvent.press(utils.getByText("common.cancel"));

    const leave = Alert.alert.mock.calls.at(-1)[2].find((b) => b.text === "common.leave");
    await act(async () => { await leave.onPress(); });

    await waitFor(() => expect(AsyncStorage.__store[DRAFT_KEY]).toBeUndefined());
    expect(ctx.handleSaveNote).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });
});

// 2단계 — 반복 연습 측정. 노트 작성 화면 한 번 = 연습 세션 하나.
describe("NoteCreateScreen — 연습 세션", () => {
  beforeEach(resetAll);

  it("(a) 마운트 시 세션이 시작되고, 저장 시 같은 세션이 노트 id로 완료된다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 1757740000000);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    expect(startPractice).toHaveBeenCalledWith("text", null, "acting");

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    fireEvent.press(utils.getByText("common.save"));

    expect(completePractice).toHaveBeenCalledTimes(1);
    const [session, overrides] = completePractice.mock.calls[0];
    expect(session.sessionId).toBe("sess-new");
    expect(overrides.subjectKey).toBe(1757740000000);
    expect(overrides.kind).toBe("text");
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
  });

  it("(b) 영상이 붙어 있으면 완료 종류가 video", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 42);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    await attachVideo(utils);
    fireEvent.press(utils.getByText("common.save"));

    expect(completePractice.mock.calls[0][1]).toEqual(
      expect.objectContaining({ subjectKey: 42, kind: "video" })
    );
  });

  it("(c) AI 분석 성공마다 ai_feedback_done — 텍스트·영상 종류로 구분", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    await runAi(utils);
    expect(aiFeedbackDone).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-new" }), "text");

    await attachVideo(utils);
    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.video_ai_analyze"));
    });
    await waitFor(() => utils.getByText("noteCreate.video_ai_result"));
    expect(aiFeedbackDone).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-new" }), "video");
  });

  it("(d) 초안 복원이면 새 세션을 만들지 않고 초안의 sessionId를 이어받는다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 7);
    useApp.mockReturnValue(ctx);
    const utils = render(
      <NoteCreateScreen
        navigation={navigation}
        route={{ params: { prefill: { content: "본문", field: "music", sessionId: "sess-kept" }, restoredDraft: true } }}
      />
    );

    expect(startPractice).not.toHaveBeenCalled();
    expect(resumePractice).toHaveBeenCalledWith("sess-kept", "text", null, "music");

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    fireEvent.press(utils.getByText("common.save"));
    expect(completePractice.mock.calls[0][0].sessionId).toBe("sess-kept");
  });

  it("(e) 가입 왕복으로 보관되는 초안에 sessionId가 들어간다", async () => {
    useApp.mockReturnValue(buildCtx(null));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    const cta = Alert.alert.mock.calls[0][2].find((b) => b.text === "signupNudge.cta");
    await act(async () => { await cta.onPress(); });

    expect(JSON.parse(AsyncStorage.__store[DRAFT_KEY]).sessionId).toBe("sess-new");
  });
});

// 프리미엄 구독자에게 "무료 체험 소진 · 프리미엄 보기"를 또 띄우던 문제(2026-09-17).
// 이미 결제한 사람에겐 결제 권유가 아니라 남은 한도를 알려줘야 한다.
describe("NoteCreateScreen — 쿼터 소진 안내", () => {
  beforeEach(resetAll);

  it("프리미엄이면 결제 권유 대신 하루 한도 소진 문구를 띄운다(구독 화면 이동 없음)", async () => {
    useApp.mockReturnValue(buildCtx("u1", { active: true, kind: "sub", plan: "yearly" }));
    const err = new Error("AI_QUOTA");
    err.quotaMax = 10;
    err.quotaUsed = 10;
    analyzeNote.mockRejectedValue(err);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    const call = Alert.alert.mock.calls.find((c) => c[0] === "premium.active_title");
    expect(call).toBeTruthy();
    expect(call[1]).toBe("premium.limit_text_reached");
    // 결제 권유 경로는 타지 않는다
    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.video_quota_exceeded")).toBe(false);
    expect(navigation.navigate).not.toHaveBeenCalledWith("Subscription");
  });

  it("무료 로그인 유저는 기존대로 프리미엄 안내를 받는다", async () => {
    useApp.mockReturnValue(buildCtx("u1", { active: false }));
    analyzeNote.mockRejectedValue(new Error("AI_QUOTA"));

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await runAi(utils);

    const call = Alert.alert.mock.calls.find((c) => c[0] === "common.video_quota_exceeded");
    expect(call).toBeTruthy();
    expect(call[2].some((b) => b.text === "premium.quota_cta")).toBe(true);
  });
});

// 3단계 — 재연습 체인: 초점·부모 노트·장면 id가 저장 데이터와 연습 계측에 그대로 실린다
describe("NoteCreateScreen — 재연습 체인 (focus · parentNoteId · sceneId)", () => {
  beforeEach(resetAll);

  const parent = {
    id: 100,
    title: "햄릿 독백",
    field: "acting",
    aiComment: "📌 인상\n좋다.\n🎯 개선 포인트\n첫 문장이 빠르다.\n🔜 다음",
    aiScores: { technique: 5 },
    chosenFocus: "첫 문장 호흡 늦추기",
  };
  const repracticeRoute = {
    params: {
      prefill: {
        title: "햄릿 독백",
        field: "acting",
        seriesName: "햄릿 독백",
        rootNoteId: 100,
        parentNoteId: 100,
        focus: "첫 문장 호흡 늦추기",
        sceneId: "hamlet-1",
      },
    },
  };

  it("재연습이면 초점을 상단에 고정 표시하고, 연습 세션 subjectKey가 장면 id로 묶인다", () => {
    const ctx = buildCtx("u1");
    ctx.savedNotes = [parent];
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={repracticeRoute} />);

    expect(utils.getByText("focus.current: 첫 문장 호흡 늦추기")).toBeTruthy();
    expect(startPractice).toHaveBeenCalledWith("text", "hamlet-1", "acting");
  });

  it("분석 요청에 이번 초점(focus)과 직전 연습(previous)이 실린다", async () => {
    const ctx = buildCtx("u1");
    ctx.savedNotes = [parent];
    useApp.mockReturnValue(ctx);
    analyzeNote.mockResolvedValue({ analysis: "피드백", scores: null, focusOptions: ["시선 고정", "볼륨 낮추기"] });

    const utils = render(<NoteCreateScreen navigation={navigation} route={repracticeRoute} />);
    await runAi(utils);

    const extra = analyzeNote.mock.calls[0][6];
    expect(extra.focus).toBe("첫 문장 호흡 늦추기");
    expect(extra.previous).toEqual({ focus: "첫 문장 호흡 늦추기", summary: "지난 요약", scores: { technique: 5 } });
  });

  it("고른 초점·체인·후보가 저장 데이터에 들어가고, 완료 계측도 장면 id로 간다", async () => {
    const ctx = buildCtx("u1");
    ctx.savedNotes = [parent];
    ctx.handleSaveNote = jest.fn(() => 777);
    useApp.mockReturnValue(ctx);
    analyzeNote.mockResolvedValue({ analysis: "피드백", scores: null, focusOptions: ["시선 고정", "볼륨 낮추기"] });

    const utils = render(<NoteCreateScreen navigation={navigation} route={repracticeRoute} />);
    await runAi(utils);

    // AI 결과 아래 "다음 연습에서 고칠 점 하나 고르기" 칩
    expect(utils.getByText("focus.pick_title")).toBeTruthy();
    fireEvent.press(utils.getByText("시선 고정"));
    expect(trackFunnelEvent).toHaveBeenCalledWith("focus_selected", "ko");

    fireEvent.press(utils.getByText("common.save"));
    const noteData = ctx.handleSaveNote.mock.calls[0][0];
    expect(noteData.sceneId).toBe("hamlet-1");
    expect(noteData.parentNoteId).toBe(100);
    expect(noteData.rootNoteId).toBe(100);
    expect(noteData.focus).toBe("첫 문장 호흡 늦추기");
    expect(noteData.chosenFocus).toBe("시선 고정");
    expect(noteData.focusOptions).toEqual(["시선 고정", "볼륨 낮추기"]);
    expect(completePractice.mock.calls[0][1].subjectKey).toBe("hamlet-1");
  });

  it("2인 대사에서 온 새 기록엔 녹음 안내가 뜨고, 체인이 없으면 기존 동작 그대로", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 42);
    useApp.mockReturnValue(ctx);

    const duetRoute = { params: { prefill: { title: "햄릿 2인 대사", field: "acting", seriesName: "햄릿", sceneId: "hamlet-1" } } };
    const utils = render(<NoteCreateScreen navigation={navigation} route={duetRoute} />);
    expect(utils.getByText("focus.duet_hint")).toBeTruthy();
    expect(utils.queryByText(/focus.current/)).toBeNull();

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "연습함");
    fireEvent.press(utils.getByText("common.save"));
    const noteData = ctx.handleSaveNote.mock.calls[0][0];
    expect(noteData.sceneId).toBe("hamlet-1");
    expect(noteData.parentNoteId).toBeUndefined();
    expect(noteData.focus).toBeUndefined();
  });

  it("체인이 전혀 없으면 subjectKey는 예전처럼 저장된 노트 id", () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 5);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    expect(startPractice).toHaveBeenCalledWith("text", null, "acting");

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    fireEvent.press(utils.getByText("common.save"));
    expect(completePractice.mock.calls[0][1].subjectKey).toBe(5);
  });
});
