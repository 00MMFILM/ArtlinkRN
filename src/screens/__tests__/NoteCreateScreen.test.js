jest.mock("expo-speech", () => ({speak:jest.fn(),stop:jest.fn(async () => {}),getAvailableVoicesAsync:jest.fn(async () => [{language:"ko-KR",identifier:"korean"}])}));
import React from "react";
import { Alert, AppState } from "react-native";
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
  abandonPractice: jest.fn(),
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
jest.mock("expo-av", () => ({
  Audio: {
    Recording: jest.fn(),
    Sound: { createAsync: jest.fn() },
    setAudioModeAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
  },
}));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  cacheDirectory: "file:///cache/",
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

const { analyzeNote, analyzeVideoFrames, lastAiMeta, buildPreviousContext } = require("../../services/aiService");
const { Audio } = require("expo-av");
const { showInterstitialAd, showRewardedAd, incrementDailyAICount, shouldShowInterstitial } = require("../../services/adService");
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

const navigation = { dispatch: jest.fn(), replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), addListener: jest.fn(() => jest.fn()) };

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
  AppState.currentState = "active";
  Audio.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
  Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  analyzeNote.mockResolvedValue({ analysis: "좋아요", scores: null });
  analyzeVideoFrames.mockResolvedValue("영상 분석 결과");
  hasAskedReminder.mockResolvedValue(false);
  Object.keys(lastAiMeta).forEach((k) => delete lastAiMeta[k]);
};

// 해결 시점을 테스트가 쥐고 있는 약속 (분석 진행 중 상태를 만들기 위해)
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("confirmed note persistence", () => {
  beforeEach(resetAll);
  it("keeps the draft and screen when permanent saving fails, then allows retry", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote.mockRejectedValueOnce(new Error("LOCAL_STORAGE_WRITE_FAILED")).mockResolvedValueOnce(99);
    useApp.mockReturnValue(ctx);
    const draft = JSON.stringify({ title: "보존 제목", content: "보존 내용" });
    AsyncStorage.__store[DRAFT_KEY] = draft;
    const utils = render(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: { title: "보존 제목", content: "보존 내용" } } }} />);
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(AsyncStorage.__store[DRAFT_KEY]).toBe(draft);
    expect(completePractice).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("note_saved", "ko");
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(2);
  });
});

describe("studio context in note creation", () => {
  beforeEach(resetAll);
  const meta = {
    feedbackLanguage: "ko", scriptLanguage: "en",
    rehearsalContext: { sceneTitle: "Scene", role: "Lear", feedbackLanguage: "ko", scriptLanguage: "en" },
    applicationContext: { postId: "casting-1", title: "Application", country: "UK", submissions: ["Self-tape"] },
  };
  const routeWith = (extra = {}) => ({ params: { prefill: { title: "Scene", content: "English script", field: "acting", ...meta, ...extra } } });

  it("shows accepted context and carries it into text analysis and permanent saving", async () => {
    const ctx = buildCtx("u1"); ctx.handleSaveNote.mockResolvedValue(22);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={routeWith()} />);
    expect(utils.getByTestId("studio-context-card")).toBeTruthy();
    expect(utils.getByText("Lear")).toBeTruthy();
    expect(utils.getByText("UK")).toBeTruthy();
    await act(async () => fireEvent.press(utils.getByText("noteCreate.ai_analyze")));
    expect(analyzeNote.mock.calls[0][3]).toEqual(expect.objectContaining(meta));
    expect(analyzeNote.mock.calls[0][6]).toEqual(expect.objectContaining(meta));
    await act(async () => fireEvent.press(utils.getByText("common.save")));
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining(meta));
  });

  it("carries the same selected language and role into video analysis", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={routeWith({ images: [{ uri: "file:///take.mov", type: "video", duration: 5000 }] })} />);
    await act(async () => fireEvent.press(utils.getByText("noteCreate.video_ai_analyze")));
    expect(analyzeVideoFrames.mock.calls[0][6]).toEqual(expect.objectContaining(meta));
  });

  it("keeps the current metadata when a replacement prefill is not accepted", async () => {
    const ctx = buildCtx("u1"); ctx.handleSaveNote.mockResolvedValue(22);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={routeWith()} />);
    utils.rerender(<NoteCreateScreen navigation={navigation} route={routeWith({ feedbackLanguage: "en", rehearsalContext: { role: "Other", feedbackLanguage: "en" } })} />);
    expect(Alert.alert).toHaveBeenCalledWith("noteCreate.replace_with_new_title", "noteCreate.replace_with_new_message", expect.any(Array));
    expect(utils.getByText("Lear")).toBeTruthy();
    await act(async () => fireEvent.press(utils.getByText("common.save")));
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining(meta));
  });

  it("updates analysis callbacks after accepting a new language and clears absent old context", async () => {
    const ctx = buildCtx("u1"); ctx.handleSaveNote.mockResolvedValue(22);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={routeWith()} />);
    const replacement = { params: { prefill: { title: "Next", content: "다음 대본", feedbackLanguage: "en", scriptLanguage: "ko" } } };
    utils.rerender(<NoteCreateScreen navigation={navigation} route={replacement} />);
    const confirm = Alert.alert.mock.calls.find((call) => call[0] === "noteCreate.replace_with_new_title")[2].find((button) => button.text === "common.confirm");
    await act(async () => confirm.onPress());
    expect(utils.queryByTestId("studio-context-card")).toBeNull();
    await act(async () => fireEvent.press(utils.getByText("noteCreate.ai_analyze")));
    expect(analyzeNote.mock.calls[0][6]).toEqual(expect.objectContaining({ feedbackLanguage: "en", scriptLanguage: "ko" }));
    expect(analyzeNote.mock.calls[0][6].rehearsalContext).toBeUndefined();
    expect(analyzeNote.mock.calls[0][6].applicationContext).toBeUndefined();
    await act(async () => fireEvent.press(utils.getByText("common.save")));
    expect(ctx.handleSaveNote.mock.calls[0][0].applicationContext).toBeUndefined();
  });

  it("includes studio metadata in the actual signup draft rather than only the final note", async () => {
    useApp.mockReturnValue(buildCtx(null));
    const utils = render(<NoteCreateScreen navigation={navigation} route={routeWith()} />);
    await act(async () => fireEvent.press(utils.getByText("noteCreate.ai_analyze")));
    await waitFor(() => expect(Alert.alert.mock.calls.some((call) => call[0] === "signupNudge.title")).toBe(true));
    const signup = Alert.alert.mock.calls.find((call) => call[0] === "signupNudge.title")[2].find((button) => button.text === "signupNudge.cta");
    await act(async () => signup.onPress());
    expect(JSON.parse(AsyncStorage.__store[DRAFT_KEY])).toEqual(expect.objectContaining(meta));
  });
});

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

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });

    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
    const noteData = ctx.handleSaveNote.mock.calls[0][0];
    expect(noteData.content).toBe("");
    expect(noteData.videoAnalysis).toBe("영상 분석 결과");
    expect(noteData.images).toHaveLength(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
    expect(navigation.replace).toHaveBeenCalledWith("NoteDetail", { noteId: undefined, initialTab: "ai" });
  });

  it("(b) 본문·첨부·분석이 전부 비면 저장되지 않고 안내가 뜬다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목만");
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });

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

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
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
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });

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

  it("(a) 첫 입력에서 세션이 시작되고, 저장 시 같은 세션이 노트 id로 완료된다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 1757740000000);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    // 열기만 한 상태에선 아직 연습이 아니다
    expect(startPractice).not.toHaveBeenCalled();

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    expect(startPractice).toHaveBeenCalledWith("text", null, "acting");
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });

    expect(completePractice).toHaveBeenCalledTimes(1);
    const [session, overrides] = completePractice.mock.calls[0];
    expect(session.sessionId).toBe("sess-new");
    expect(overrides.subjectKey).toBe(1757740000000);
    expect(overrides.kind).toBe("text");
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
    // 저장되는 노트에 세션 id가 실려야 홈/성장 리포트가 연습 기록과 중복 집계하지 않는다
    expect(ctx.handleSaveNote.mock.calls[0][0].practiceSessionId).toBe("sess-new");
  });

  it("(b) 영상이 붙어 있으면 완료 종류가 video", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 42);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    await attachVideo(utils);
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });

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
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(completePractice.mock.calls[0][0].sessionId).toBe("sess-kept");
    // 2인 대사에서 넘어온 세션의 sessionId도 노트에 그대로 실린다
    expect(ctx.handleSaveNote.mock.calls[0][0].practiceSessionId).toBe("sess-kept");
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

    // 글 피드백 한도 초과에 영상 문구를 쓰면 안 된다
    const call = Alert.alert.mock.calls.find((c) => c[0] === "common.text_quota_exceeded");
    expect(call).toBeTruthy();
    expect(call[2].some((b) => b.text === "premium.quota_cta")).toBe(true);
    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.video_quota_exceeded")).toBe(false);
  });

  it("영상 분석 한도 초과에는 영상 문구를 쓴다", async () => {
    useApp.mockReturnValue(buildCtx("u1", { active: false }));
    const err = new Error("video ai failed");
    err.videoAiReason = "QUOTA";
    analyzeVideoFrames.mockRejectedValue(err);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await attachVideo(utils);
    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.video_ai_analyze"));
    });

    await waitFor(() =>
      expect(Alert.alert.mock.calls.some((c) => c[0] === "common.video_quota_exceeded")).toBe(true)
    );
    expect(Alert.alert.mock.calls.some((c) => c[0] === "common.text_quota_exceeded")).toBe(false);
  });
});

// 3단계 — 재연습 체인: 초점·부모 노트·장면 id가 저장 데이터와 연습 계측에 그대로 실린다
describe("NoteCreateScreen — 재연습 체인 (focus · parentNoteId · sceneId)", () => {
  beforeEach(resetAll);

  it("ACT RAW sceneId를 노트와 시작·완료 이벤트의 같은 장면 키로 보존한다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 321);
    useApp.mockReturnValue(ctx);
    const sceneId = "actraw:daehanmingukeseo-geonmulju-doeneun-beop-jangdongcheol-ibanseok";
    const utils = render(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: {
      title: "ACT RAW 장면", content: "연습 기록", field: "acting", sceneId,
    } } }} />);
    await act(async () => fireEvent.press(utils.getByText("common.save")));
    expect(startPractice).toHaveBeenCalledWith("text", sceneId, "acting");
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({ sceneId }));
    expect(completePractice).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ subjectKey: sceneId }));
  });

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

  it("재연습이면 초점을 상단에 고정 표시하고, 연습 세션 subjectKey가 장면 id로 묶인다", async () => {
    const ctx = buildCtx("u1");
    ctx.savedNotes = [parent];
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={repracticeRoute} />);

    expect(utils.getByText("focus.current: 첫 문장 호흡 늦추기")).toBeTruthy();
    // 열기만 해서는 시작되지 않고, 첫 입력에서 장면 id로 묶여 시작된다
    expect(startPractice).not.toHaveBeenCalled();
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "연습함");
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

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
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
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    const noteData = ctx.handleSaveNote.mock.calls[0][0];
    expect(noteData.sceneId).toBe("hamlet-1");
    expect(noteData.parentNoteId).toBeUndefined();
    expect(noteData.focus).toBeUndefined();
  });

  it("체인이 전혀 없으면 subjectKey는 예전처럼 저장된 노트 id", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 5);
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    expect(startPractice).toHaveBeenCalledWith("text", null, "acting");
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(completePractice.mock.calls[0][1].subjectKey).toBe(5);
  });
});

// ─── 버그 수정 회귀 테스트 ───

describe("항목1 — 글 없이 녹음·첨부만 있어도 AI 분석", () => {
  beforeEach(resetAll);

  const withVoice = { params: { prefill: { voiceRecordings: [{ uri: "file:///a.m4a", duration: 7 }] } } };

  it("녹음만 있으면 분석이 막히지 않는다 (2인 대사에서 온 화면)", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={withVoice} />);

    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
    });

    expect(analyzeNote).toHaveBeenCalledTimes(1);
    expect(Alert.alert.mock.calls.some((c) => c[0] === "noteCreate.ai_content_required")).toBe(false);
  });

  it("영상만 있으면 글 분석은 막는다 — 영상은 글 분석에 실리지 않아 빈 분석으로 횟수만 쓴다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const onlyVideo = { params: { prefill: { images: [{ uri: "file:///v.mp4", type: "video" }] } } };
    const utils = render(<NoteCreateScreen navigation={navigation} route={onlyVideo} />);

    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
    });

    expect(analyzeNote).not.toHaveBeenCalled();
    expect(Alert.alert.mock.calls.some((c) => c[0] === "noteCreate.ai_content_required")).toBe(true);
  });

  it("글도 첨부도 없으면 예전처럼 막는다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
    });

    expect(analyzeNote).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("noteCreate.ai_content_required", "noteCreate.ai_content_required_msg");
  });
});

describe("항목2 — 영상 AI만 돌려도 고칠 점 칩이 뜬다", () => {
  beforeEach(resetAll);

  it("영상 분석 결과에 후보가 오면 FocusPicker가 보인다 (글 피드백 없이)", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 11);
    useApp.mockReturnValue(ctx);
    lastAiMeta.focusOptions = ["시선 고정", "손 동작 줄이기"];

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await attachVideo(utils);
    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.video_ai_analyze"));
    });
    await waitFor(() => utils.getByText("noteCreate.video_ai_result"));

    expect(utils.queryByText("noteCreate.ai_result")).toBeNull(); // 글 피드백은 없다
    expect(utils.getByText("focus.pick_title")).toBeTruthy();
    fireEvent.press(utils.getByText("시선 고정"));

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote.mock.calls[0][0].chosenFocus).toBe("시선 고정");
  });
});

describe("항목3 — 재생 중 화면을 나가면 소리가 멈춘다", () => {
  beforeEach(resetAll);

  it("언마운트 시 재생 중인 sound를 unload한다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const sound = { playAsync: jest.fn(), unloadAsync: jest.fn(), setOnPlaybackStatusUpdate: jest.fn() };
    Audio.Sound.createAsync.mockResolvedValue({ sound });

    const utils = render(
      <NoteCreateScreen
        navigation={navigation}
        route={{ params: { prefill: { voiceRecordings: [{ uri: "file:///a.m4a", duration: 3 }] } } }}
      />
    );
    await act(async () => {
      fireEvent.press(utils.getAllByText("▶️")[0]);
    });
    expect(sound.playAsync).toHaveBeenCalled();

    utils.unmount();
    expect(sound.unloadAsync).toHaveBeenCalled();
  });
});

describe("항목4 — 분석 중에는 저장이 막힌다", () => {
  beforeEach(resetAll);

  it("글 분석이 도는 동안 저장을 눌러도 노트가 저장되지 않는다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const d = deferred();
    analyzeNote.mockReturnValue(d.promise);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
    });
    expect(utils.getByText("noteCreate.ai_analyzing")).toBeTruthy();

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).not.toHaveBeenCalled();

    // 분석이 끝나면 다시 저장된다
    await act(async () => { d.resolve({ analysis: "완료", scores: null }); });
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
  });

  it("영상 분석이 도는 동안에도 저장이 막힌다", async () => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const d = deferred();
    analyzeVideoFrames.mockReturnValue(d.promise);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await attachVideo(utils);
    await act(async () => {
      fireEvent.press(utils.getByText("noteCreate.video_ai_analyze"));
    });

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).not.toHaveBeenCalled();

    await act(async () => { d.resolve("영상 분석 결과"); });
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
  });
});

describe("항목6 — 새 prefill이 작성 중인 글을 덮어쓰기 전에 묻는다", () => {
  beforeEach(resetAll);

  const newPrefill = { title: "새 대본", content: "새 내용", field: "acting" };

  it("쓰던 내용이 있으면 확인 후에만 바뀐다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "내가 쓰던 글");

    utils.rerender(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: newPrefill } }} />);

    // 확인 전에는 그대로
    expect(utils.getByPlaceholderText("noteCreate.content_placeholder").props.value).toBe("내가 쓰던 글");
    const call = Alert.alert.mock.calls.find((c) => c[0] === "noteCreate.replace_with_new_title");
    expect(call).toBeTruthy();
    expect(call[1]).toBe("noteCreate.replace_with_new_message");

    act(() => { call[2].find((b) => b.text === "common.confirm").onPress(); });
    expect(utils.getByPlaceholderText("noteCreate.content_placeholder").props.value).toBe("새 내용");
    expect(utils.getByPlaceholderText("noteCreate.title_placeholder").props.value).toBe("새 대본");
  });

  it("비어 있으면 묻지 않고 바로 반영한다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);

    utils.rerender(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: newPrefill } }} />);

    expect(utils.getByPlaceholderText("noteCreate.content_placeholder").props.value).toBe("새 내용");
    expect(Alert.alert.mock.calls.some((c) => c[0] === "noteCreate.replace_with_new_title")).toBe(false);
  });

  it("마운트할 때 받은 prefill에는 확인창이 뜨지 않는다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    render(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: newPrefill } }} />);
    expect(Alert.alert.mock.calls.some((c) => c[0] === "noteCreate.replace_with_new_title")).toBe(false);
  });
});

describe("항목7 — 재분석하면 옛 고칠 점 선택이 남지 않는다", () => {
  beforeEach(resetAll);

  it("새 후보에 없는 chosenFocus는 비워진다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 9);
    useApp.mockReturnValue(ctx);
    analyzeNote.mockResolvedValue({ analysis: "1차", scores: null, focusOptions: ["시선 고정", "호흡"] });

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });
    fireEvent.press(utils.getByText("시선 고정"));

    analyzeNote.mockResolvedValue({ analysis: "2차", scores: null, focusOptions: ["발음", "속도"] });
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });

    expect(utils.queryByText("시선 고정")).toBeNull();
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote.mock.calls[0][0].chosenFocus).toBeUndefined();
  });

  it("새 후보에도 있으면 선택이 유지된다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 9);
    useApp.mockReturnValue(ctx);
    analyzeNote.mockResolvedValue({ analysis: "1차", scores: null, focusOptions: ["시선 고정", "호흡"] });

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });
    fireEvent.press(utils.getByText("시선 고정"));

    analyzeNote.mockResolvedValue({ analysis: "2차", scores: null, focusOptions: ["시선 고정", "속도"] });
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });

    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.title_placeholder"), "제목");
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote.mock.calls[0][0].chosenFocus).toBe("시선 고정");
  });
});

describe("항목9 — 화면을 나간 뒤에는 알림이 뜨지 않는다", () => {
  beforeEach(resetAll);

  it("분석 실패가 언마운트 뒤에 와도 Alert를 띄우지 않는다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const d = deferred();
    analyzeNote.mockReturnValue(d.promise);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });

    utils.unmount();
    Alert.alert.mockClear();
    await act(async () => { d.reject(new Error("AI_SERVER_ERROR")); });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("한도 초과 알림도 언마운트 뒤에는 뜨지 않는다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const d = deferred();
    analyzeNote.mockReturnValue(d.promise);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });

    utils.unmount();
    Alert.alert.mockClear();
    await act(async () => { d.reject(new Error("AI_QUOTA")); });

    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe("항목10 — 화면을 열기만 하면 연습으로 세지 않는다", () => {
  beforeEach(resetAll);

  it("열어서 보기만 하고 나가면 practice_started가 없다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    utils.unmount();
    expect(startPractice).not.toHaveBeenCalled();
    expect(resumePractice).not.toHaveBeenCalled();
  });

  it("첨부만 해도 세션이 시작된다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    expect(startPractice).not.toHaveBeenCalled();

    await attachVideo(utils);
    expect(startPractice).toHaveBeenCalledTimes(1);
  });

  it("세션 없이 저장해도 completePractice는 세션을 들고 간다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 3);
    useApp.mockReturnValue(ctx);
    // 사용자가 입력하지 않은 prefill 상태에서 바로 저장
    const utils = render(
      <NoteCreateScreen navigation={navigation} route={{ params: { prefill: { title: "대본", content: "내용" } } }} />
    );
    expect(startPractice).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(startPractice).toHaveBeenCalledTimes(1);
    expect(completePractice.mock.calls[0][0]).toEqual(expect.objectContaining({ sessionId: "sess-new" }));
  });
});

describe("항목16 — 프리미엄에게는 광고를 띄우지 않는다", () => {
  beforeEach(resetAll);

  it("해외 프리미엄 유저는 전면 광고 없이 글 분석이 진행된다", async () => {
    const ctx = buildCtx("u1", { active: true });
    ctx.isKoreanLocale = false;
    useApp.mockReturnValue(ctx);
    shouldShowInterstitial.mockReturnValue(true);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "본문");
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.ai_analyze")); });

    expect(showInterstitialAd).not.toHaveBeenCalled();
    expect(incrementDailyAICount).not.toHaveBeenCalled();
    expect(analyzeNote).toHaveBeenCalledTimes(1);
  });

  it("해외 프리미엄 유저는 보상형 광고 없이 영상 분석이 진행된다", async () => {
    const ctx = buildCtx("u1", { active: true });
    ctx.isKoreanLocale = false;
    useApp.mockReturnValue(ctx);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await attachVideo(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.video_ai_analyze")); });

    expect(showRewardedAd).not.toHaveBeenCalled();
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
  });

  it("해외 무료 유저는 예전처럼 광고를 본다", async () => {
    const ctx = buildCtx("u1", { active: false });
    ctx.isKoreanLocale = false;
    useApp.mockReturnValue(ctx);
    showRewardedAd.mockResolvedValue(true);

    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await attachVideo(utils);
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.video_ai_analyze")); });

    expect(showRewardedAd).toHaveBeenCalled();
  });
});

describe("녹음 파일 캐시 → 문서 폴더 보존 (OS 캐시 정리로 녹음 유실 방지)", () => {
  const FileSystem = require("expo-file-system/legacy");
  beforeEach(() => { jest.clearAllMocks(); });
  const cacheRec = { params: { prefill: { title: "햄릿 2인 대사", voiceRecordings: [
    { uri: "file:///cache/Audio/recording-1.m4a", duration: 5 },
    { uri: "file:///doc/media/kept.m4a", duration: 3 },
  ] } } };

  it("캐시 uri 녹음은 저장 시 document/media로 복사되고 노트엔 새 uri가 저장된다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 1);
    useApp.mockReturnValue(ctx);
    FileSystem.getInfoAsync.mockResolvedValueOnce({ exists: false });
    const utils = render(<NoteCreateScreen navigation={navigation} route={cacheRec} />);

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    await waitFor(() => expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1));

    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith("file:///doc/media/", { intermediates: true });
    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1); // 이미 문서 폴더인 녹음은 복사하지 않는다
    const { from, to } = FileSystem.copyAsync.mock.calls[0][0];
    expect(from).toBe("file:///cache/Audio/recording-1.m4a");
    expect(to.startsWith("file:///doc/media/")).toBe(true);
    expect(to.endsWith(".m4a")).toBe(true);
    const recs = ctx.handleSaveNote.mock.calls[0][0].voiceRecordings;
    expect(recs).toEqual([{ uri: to, duration: 5 }, { uri: "file:///doc/media/kept.m4a", duration: 3 }]);
  });

  it("복사에 실패하면 저장과 화면 종료를 막고 재시도를 허용한다", async () => {
    const ctx = buildCtx("u1");
    ctx.handleSaveNote = jest.fn(() => 1);
    useApp.mockReturnValue(ctx);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    FileSystem.copyAsync.mockRejectedValueOnce(new Error("disk full"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={cacheRec} />);

    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("common.save_failed_title", "common.save_failed_msg");
    expect(navigation.goBack).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("1.11.9 retake creation", () => {
  const parent = { id: 10, title: "First take", field: "acting", rootNoteId: 1, sceneId: "scene", chosenFocus: "호흡", videoAnalysis: "🎯 breathe", images: [{ type: "video", uri: "file:///old.mov" }] };
  const retakeRoute = { params: { prefill: { title: "Next take", field: "acting", parentNoteId: 10, rootNoteId: 1, sceneId: "scene", focus: "호흡" } } };
  beforeEach(() => {
    resetAll();
    Alert.alert.mockImplementation((title, message, buttons) => {
      if (title === "retake.replace_video_title") buttons.find((button) => button.text === "retake.replace_video_confirm").onPress();
    });
    require("expo-file-system/legacy").copyAsync.mockResolvedValue();
    require("expo-file-system/legacy").getInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    Audio.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  });
  const setup = (authId = "u1", extra = {}, route = retakeRoute) => {
    const ctx = { ...buildCtx(authId), savedNotes: [parent], handleSaveNote: jest.fn(async () => 22), refreshPremium: jest.fn(), ...extra };
    useApp.mockReturnValue(ctx);
    return { ctx, utils: render(<NoteCreateScreen navigation={navigation} route={route} />) };
  };
  const addRetake = async (utils) => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ type: "video", uri: "file:///take.mov", duration: 30000 }] });
    VideoThumbnails.getThumbnailAsync.mockResolvedValue({ uri: "file:///thumb.jpg" });
    await act(async () => fireEvent.press(utils.getByText("retake.pick_gallery")));
  };
  it("saves a first result once and replaces it with a fresh take without copying video/results", async () => {
    const { ctx, utils } = setup("u1", {}, {});
    lastAiMeta.focusOptions = ["호흡"];
    await attachVideo(utils);
    await act(async () => fireEvent.press(utils.getByText("noteCreate.video_ai_analyze")));
    expect(utils.queryByText("noteCreate.video_ai_analyze")).toBeNull();
    expect(utils.getByText("retake.reanalyze_link")).toBeTruthy();
    fireEvent.press(utils.getByText("호흡"));
    const saved = deferred();
    ctx.handleSaveNote.mockReturnValue(saved.promise);
    await act(async () => { fireEvent.press(utils.getByText("retake.fix_and_retake")); fireEvent.press(utils.getByText("retake.fix_and_retake")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => saved.resolve(22));
    expect(navigation.replace).toHaveBeenCalledWith("NoteCreate", { prefill: { title: expect.any(String), field: "acting", seriesName: expect.any(String), rootNoteId: 22, parentNoteId: 22, sceneId: undefined, focus: "호흡" } });
    expect(completePractice).toHaveBeenCalledWith(expect.any(Object), { subjectKey: 22, kind: "video" });
  });
  it("retake save opens the newly saved AI tab and keeps the subject key", async () => {
    const { ctx, utils } = setup();
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    expect(ctx.refreshPremium).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("retake_capture_added", "ko");
    expect(trackFunnelEvent).toHaveBeenCalledWith("retake_analysis_done", "ko");
    await act(async () => fireEvent.press(utils.getByText("retake.save_compare")));
    expect(navigation.replace).toHaveBeenCalledWith("NoteDetail", { noteId: 22, initialTab: "ai" });
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({ parentNoteId: 10, rootNoteId: 1, sceneId: "scene", focus: "호흡" }));
    expect(completePractice).toHaveBeenCalledWith(expect.any(Object), { subjectKey: "scene", kind: "video" });
  });
  it("asks before repeating the same analysis and preserves the completed result if retry fails", async () => {
    const { ctx, utils } = setup();
    await addRetake(utils);
    lastAiMeta.transcript = "original transcript";
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    await act(async () => fireEvent.press(utils.getByText("retake.reanalyze_link")));
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
    const confirm = Alert.alert.mock.calls.find((c) => c[0] === "retake.reanalyze_title")[2].find((b) => b.text === "retake.reanalyze_confirm");
    analyzeVideoFrames.mockImplementationOnce(async () => { lastAiMeta.transcript = "failed new transcript"; throw new Error("NETWORK"); });
    await act(async () => confirm.onPress());
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(2);
    expect(utils.getByText("영상 분석 결과")).toBeTruthy();
    await act(async () => fireEvent.press(utils.getByText("retake.save_compare")));
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({ videoAnalysis: "영상 분석 결과", transcript: "original transcript" }));
  });
  it("replacing the take clears its old result, focus, and stale confirmation", async () => {
    const { utils } = setup();
    await addRetake(utils);
    lastAiMeta.focusOptions = ["호흡"];
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    fireEvent.press(utils.getByText("호흡"));
    fireEvent.press(utils.getByText("retake.reanalyze_link"));
    const confirm = Alert.alert.mock.calls.find((c) => c[0] === "retake.reanalyze_title")[2].find((b) => b.text === "retake.reanalyze_confirm");
    await addRetake(utils);
    expect(utils.queryByText("영상 분석 결과")).toBeNull();
    expect(utils.queryByText("retake.capture_again")).toBeNull();
    await act(async () => confirm.onPress());
    expect(analyzeVideoFrames).toHaveBeenCalledTimes(1);
  });
  it("shows real video allowance before capture and does not request AI when exhausted", async () => {
    const { utils } = setup("u1", { usage: { video: { left: 0, max: 3 } } });
    expect(utils.getByText("retake.quota_empty")).toBeTruthy();
    expect(utils.getByText("retake.video_trial_remaining")).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("common.video_quota_exceeded", "", expect.any(Array));
  });
  it("requests both permissions then records a video with a five minute cap, without automatic AI", async () => {
    const { utils } = setup();
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ status: "granted" });
    ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ type: "video", uri: "file:///camera.mov", duration: 5000 }] });
    await act(async () => fireEvent.press(utils.getByText("retake.capture_now")));
    expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["videos"], videoMaxDuration: 300 }));
    expect(utils.getByText("retake.analyze_improvement")).toBeTruthy();
    expect(analyzeVideoFrames).not.toHaveBeenCalled();
  });
  it("denied microphone permission does not start recording", async () => {
    const { utils } = setup();
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ status: "granted" });
    Audio.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    await act(async () => fireEvent.press(utils.getByText("retake.capture_now")));
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("common.permission_required", "common.mic_permission");
  });
  it("keeps a ready-to-record guest draft before opening signup", async () => {
    const { utils } = setup(null);
    fireEvent.press(utils.getByText("premium.guest_trial_cta"));
    await waitFor(() => expect(setAuthState).toHaveBeenCalledWith("auth"));
    expect(JSON.parse(AsyncStorage.__store[DRAFT_KEY])).toEqual(expect.objectContaining({ parentNoteId: 10, rootNoteId: 1, sceneId: "scene", focus: "호흡" }));
  });
  it("a late result after account switch is discarded with no completion event", async () => {
    const { ctx, utils } = setup();
    const pending = deferred();
    analyzeVideoFrames.mockReturnValue(pending.promise);
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    useApp.mockReturnValue({ ...ctx, userProfile: { authUserId: "u2" } });
    utils.rerender(<NoteCreateScreen navigation={navigation} route={retakeRoute} />);
    await act(async () => pending.resolve("other user result"));
    expect(utils.queryByText("other user result")).toBeNull();
    expect(aiFeedbackDone).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("retake_analysis_done", "ko");
  });
  it("an account change during saving prevents navigation, completion and clearing another draft", async () => {
    const { ctx, utils } = setup();
    await addRetake(utils);
    const pending = deferred();
    ctx.handleSaveNote.mockReturnValue(pending.promise);
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    useApp.mockReturnValue({ ...ctx, userProfile: { authUserId: "u2" } });
    utils.rerender(<NoteCreateScreen navigation={navigation} route={retakeRoute} />);
    AsyncStorage.__store[DRAFT_KEY] = "another draft";
    await act(async () => pending.resolve(22));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(completePractice).not.toHaveBeenCalled();
    expect(AsyncStorage.__store[DRAFT_KEY]).toBe("another draft");
  });
  it("failed local media copy keeps the original result attached to the original take", async () => {
    const { utils } = setup();
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    require("expo-file-system/legacy").copyAsync.mockRejectedValueOnce(new Error("DISK_FULL"));
    await addRetake(utils);
    expect(utils.getByText("영상 분석 결과")).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith("noteCreate.file_select_error", "retake.media_failed");
  });
  it("cancelling video replacement keeps the previous take and result", async () => {
    const { utils } = setup();
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    Alert.alert.mockImplementation((title, message, buttons) => {
      if (title === "retake.replace_video_title") buttons.find((button) => button.text === "common.cancel").onPress();
    });
    const copies = require("expo-file-system/legacy").copyAsync.mock.calls.length;
    await addRetake(utils);
    expect(require("expo-file-system/legacy").copyAsync).toHaveBeenCalledTimes(copies);
    expect(utils.getByText("영상 분석 결과")).toBeTruthy();
  });
  it("uses the video feedback when the parent also has text feedback", async () => {
    const mixed = { ...parent, aiComment: "TEXT FEEDBACK", videoAnalysis: "VIDEO FEEDBACK", aiScores: { total: 80 } };
    const { utils } = setup("u1", { savedNotes: [mixed] });
    expect(buildPreviousContext).toHaveBeenCalledWith(expect.objectContaining({ aiComment: "VIDEO FEEDBACK", aiScores: undefined }));
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    expect(analyzeVideoFrames.mock.calls[0][6].previous.summary).toBe("지난 요약");
  });
  it("a new deep link does not change the old take's chain unless accepted", async () => {
    const { ctx, utils } = setup();
    await addRetake(utils);
    utils.rerender(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: { title: "New scene", content: "new", parentNoteId: 90, rootNoteId: 80, sceneId: "new-scene", focus: "new-focus" } } }} />);
    expect(Alert.alert).toHaveBeenCalledWith("noteCreate.replace_with_new_title", "noteCreate.replace_with_new_message", expect.any(Array));
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({ parentNoteId: 10, rootNoteId: 1, sceneId: "scene", focus: "호흡" }));
  });
  it("accepting a new deep link clears old media, results and focus", async () => {
    const { ctx, utils } = setup();
    await addRetake(utils);
    await act(async () => fireEvent.press(utils.getByText("retake.analyze_improvement")));
    utils.rerender(<NoteCreateScreen navigation={navigation} route={{ params: { prefill: { title: "New scene", content: "new content", sceneId: "new-scene" } } }} />);
    const confirm = Alert.alert.mock.calls.find((call) => call[0] === "noteCreate.replace_with_new_title")[2].find((button) => button.text === "common.confirm");
    await act(async () => confirm.onPress());
    expect(utils.queryByText("영상 분석 결과")).toBeNull();
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({ title: "New scene", content: "new content", sceneId: "new-scene", parentNoteId: undefined, rootNoteId: undefined, videoAnalysis: undefined, images: undefined, focus: undefined }));
  });
  it("leaving through the navigation guard does not display the discard dialog again", async () => {
    const { utils } = setup();
    fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "draft");
    const listener = navigation.addListener.mock.calls.find((call) => call[0] === "beforeRemove")[1];
    const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    act(() => listener(event));
    const leave = Alert.alert.mock.calls.at(-1)[2].find((button) => button.text === "common.leave");
    await act(async () => leave.onPress());
    Alert.alert.mockClear();
    event.preventDefault.mockClear();
    act(() => listener(event));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  });

});

describe("녹음 중 앱이 백그라운드로 가면", () => {
  const { AppState } = require("react-native");
  let emit;
  let rec;
  beforeEach(() => {
    resetAll();
    useApp.mockReturnValue(buildCtx("u1"));
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, fn) => { emit = fn; return { remove: jest.fn() }; });
    Audio.RecordingOptionsPresets = { HIGH_QUALITY: {} };
    Audio.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
    rec = {
      prepareToRecordAsync: jest.fn(async () => {}),
      startAsync: jest.fn(async () => {}),
      stopAndUnloadAsync: jest.fn(async () => {}),
      getURI: jest.fn(() => "file:///cache/Audio/take.m4a"),
    };
    Audio.Recording.mockImplementation(() => rec);
  });
  afterEach(() => AppState.addEventListener.mockRestore());

  it.each(["background", "inactive"])("%s: 녹음을 멈추고 녹음물은 첨부로 남긴다 — 복귀해도 다시 녹음하지 않는다", async (state) => {
    const ctx = buildCtx("u1");
    useApp.mockReturnValue(ctx);
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.record")); });
    expect(rec.startAsync).toHaveBeenCalledTimes(1);
    await act(async () => { emit(state); });
    await act(async () => { emit("background"); }); // inactive → background 순서로 와도 한 번만 첨부
    expect(rec.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(utils.getByText("noteCreate.record")).toBeTruthy());
    await act(async () => { emit("active"); });
    expect(Audio.Recording).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.press(utils.getByText("common.save")); });
    expect(ctx.handleSaveNote.mock.calls[0][0].voiceRecordings).toHaveLength(1);
  });

  it("권한 창 때문에 inactive가 와도 녹음 시작은 취소하지 않는다", async () => {
    let grant;
    Audio.requestPermissionsAsync.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.record")); });
    await act(async () => { emit("inactive"); });
    await act(async () => { emit("active"); });
    await act(async () => { grant({ status: "granted" }); });
    expect(rec.startAsync).toHaveBeenCalledTimes(1);
    expect(rec.stopAndUnloadAsync).not.toHaveBeenCalled();
    expect(utils.queryByText("noteCreate.record")).toBeNull();
  });

  it("준비 중에 백그라운드로 가면 녹음을 시작하지 않고 마이크를 놓는다", async () => {
    let grant;
    Audio.requestPermissionsAsync.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(utils.getByText("noteCreate.record")); });
    await act(async () => { emit("background"); });
    await act(async () => { grant({ status: "granted" }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1050)); });
    expect(Audio.Recording).not.toHaveBeenCalled();
    expect(utils.getByText("noteCreate.record")).toBeTruthy();
  });

  it.each(["granted", "denied"])("Android 권한 창 background → %s 응답 → active 순서를 기다린다", async (status) => {
    const permission = deferred();
    Audio.requestPermissionsAsync.mockReturnValue(permission.promise);
    const ui = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(ui.getByText("noteCreate.record")); });
    await act(async () => emit("background"));
    await act(async () => permission.resolve({ status }));
    expect(rec.startAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => emit("active"));
    if (status === "granted") expect(rec.startAsync).toHaveBeenCalledTimes(1);
    else {
      expect(rec.startAsync).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith("common.permission_required", "common.mic_permission");
    }
  });

  it("영구 거절은 OS 재요청 없이 설정 열기와 취소로 복구한다", async () => {
    const { Linking } = require("react-native");
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    Audio.getPermissionsAsync.mockResolvedValue({ status: "denied", canAskAgain: false });
    const ui = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(ui.getByText("noteCreate.record")); });
    expect(Audio.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(rec.startAsync).not.toHaveBeenCalled();
    const buttons = Alert.alert.mock.calls.at(-1)[2];
    expect(buttons[0]).toMatchObject({ text: "common.cancel", style: "cancel" });
    expect(openSettings).not.toHaveBeenCalled();
    await act(async () => { await buttons[1].onPress(); });
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it("이미 허용된 권한은 다시 요청하지 않고 중지 후 재녹음할 수 있다", async () => {
    Audio.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    const ui = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(ui.getByText("noteCreate.record")); });
    expect(rec.startAsync).toHaveBeenCalledTimes(1);
    await act(async () => emit("background"));
    await act(async () => emit("active"));
    await act(async () => { fireEvent.press(ui.getByText("noteCreate.record")); });
    expect(rec.startAsync).toHaveBeenCalledTimes(2);
    expect(Audio.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("허용 여부 조회 중 홈으로 갔다 돌아와도 이전 시작 요청을 재개하지 않는다", async () => {
    const check = deferred();
    Audio.getPermissionsAsync.mockReturnValue(check.promise);
    const ui = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(ui.getByText("noteCreate.record")); });
    await act(async () => { emit("background"); emit("active"); });
    await act(async () => check.resolve({ status: "granted" }));
    expect(rec.startAsync).not.toHaveBeenCalled();
    expect(Audio.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it.each(["unmount", "blur", "account"])("권한 창 대기 중 %s 후 늦은 허용은 녹음하지 않는다", async (leave) => {
    const permission = deferred();
    Audio.requestPermissionsAsync.mockReturnValue(permission.promise);
    let blur;
    const nav = { ...navigation, addListener: jest.fn((event, fn) => { if (event === "blur") blur = fn; return jest.fn(); }) };
    const route = { params: { prefill: { practiceMode: "standard_speech", content: "연습 대사" } } };
    const ui = render(<NoteCreateScreen navigation={nav} route={route} />);
    await act(async () => { fireEvent.press(ui.getByTestId("speech-record")); });
    await act(async () => emit("background"));
    if (leave === "unmount") ui.unmount();
    else if (leave === "blur") act(() => blur());
    else {
      useApp.mockReturnValue(buildCtx("another-account"));
      ui.rerender(<NoteCreateScreen navigation={nav} route={route} />);
    }
    await act(async () => { permission.resolve({ status: "granted" }); emit("active"); });
    expect(rec.startAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("녹음 준비 중 background 전환은 준비된 마이크를 정리한다", async () => {
    Audio.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    const prepare = deferred();
    rec.prepareToRecordAsync.mockReturnValue(prepare.promise);
    const ui = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    await act(async () => { fireEvent.press(ui.getByText("noteCreate.record")); });
    await act(async () => emit("background"));
    await act(async () => prepare.resolve());
    expect(rec.startAsync).not.toHaveBeenCalled();
    expect(rec.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
  });
});

// 1.11.10 — 홈의 "이미 연습한 영상·녹음이 있어요"로 들어오면 빈 양식 대신 올릴 곳부터 보여준다
describe("자료 올리기 안내", () => {
  beforeEach(resetAll);
  const material = { params: { prefill: { field: "acting", intent: "material" } } };

  it("자료를 들고 온 사람에게 안내와 고르기 버튼이 보이고, 영상을 고르면 사라진다", async () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={material} />);
    expect(utils.queryByText("noteCreate.material_title")).toBeTruthy();
    expect(utils.queryByText("noteCreate.material_pick_audio")).toBeTruthy();

    await act(async () => { fireEvent.press(utils.getByText("noteCreate.material_pick_video")); });
    await waitFor(() => expect(utils.queryByText("noteCreate.material_title")).toBeNull());
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    // 영상이 붙었으니 다음 할 일(영상 AI 분석)이 보인다
    expect(utils.queryByText("noteCreate.video_ai_analyze")).toBeTruthy();
  });

  it("일반 새 노트에는 안내가 없다", () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const utils = render(<NoteCreateScreen navigation={navigation} route={{}} />);
    expect(utils.queryByText("noteCreate.material_title")).toBeNull();
  });
});

describe("ACT RAW 표준어 연습 노트", () => {
  it("줄 선택 후에도 원문을 바꾸지 않고 연습 모드를 노트에 저장한다", async () => {
    const ctx = buildCtx("u1"); ctx.handleSaveNote.mockResolvedValue(44); useApp.mockReturnValue(ctx);
    const prefill = {title:"독백",content:"첫 줄\n다음 줄",field:"acting",sceneId:"actraw:test",practiceMode:"standard_speech"};
    const ui = render(<NoteCreateScreen navigation={navigation} route={{params:{prefill}}} />);
    expect(ui.getByTestId("standard-speech-practice")).toBeTruthy();
    await act(async () => { fireEvent.press(ui.getByTestId("speech-next")); });
    expect(ui.getByPlaceholderText("noteCreate.content_placeholder").props.value).toBe("첫 줄\n다음 줄");
    await act(async () => { fireEvent.press(ui.getByText("common.save")); });
    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({...prefill,speechLineIndex:1}));
  });
});

test("표준어 녹음 준비·진행·정리 중 저장을 막고 완료된 테이크만 저장한다", async () => {
  resetAll();
  const { Audio } = require("expo-av");
  Audio.RecordingOptionsPresets = { HIGH_QUALITY: {} };
  let grant, finishStop;
  Audio.requestPermissionsAsync.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
  const rec = { prepareToRecordAsync: jest.fn(async () => {}), startAsync: jest.fn(async () => {}),
    stopAndUnloadAsync: jest.fn(() => new Promise(resolve => { finishStop = resolve; })),
    getURI: jest.fn(() => "file:///cache/Audio/speech.m4a") };
  Audio.Recording.mockImplementation(() => rec);
  const ctx = buildCtx("u1"); ctx.handleSaveNote.mockResolvedValue(55); useApp.mockReturnValue(ctx);
  const ui = render(<NoteCreateScreen navigation={navigation} route={{params:{prefill:{title:"대사",content:"원래 대사",practiceMode:"standard_speech"}}}} />);
  await act(async () => { fireEvent.press(ui.getByTestId("speech-record")); });
  fireEvent.press(ui.getByText("common.save")); expect(ctx.handleSaveNote).not.toHaveBeenCalled();
  await act(async () => grant({status:"granted"}));
  expect(rec.startAsync).toHaveBeenCalledTimes(1);
  fireEvent.press(ui.getByText("common.save")); expect(ctx.handleSaveNote).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(ui.getByTestId("speech-record")); });
  fireEvent.press(ui.getByText("common.save")); expect(ctx.handleSaveNote).not.toHaveBeenCalled();
  await act(async () => finishStop());
  await act(async () => { fireEvent.press(ui.getByText("common.save")); });
  expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({practiceMode:"standard_speech",content:"원래 대사",voiceRecordings:expect.arrayContaining([expect.objectContaining({uri:expect.stringContaining("file:///doc/media/")})])}));
});

test.each(["speech-record", "speech-listen"])("늦게 준비된 이전 테이크는 %s 시작 뒤 재생되지 않는다", async (target) => {
  resetAll();
  const { Audio } = require("expo-av");
  let resolveSound;
  Audio.Sound.createAsync.mockImplementation(() => new Promise(resolve => { resolveSound = resolve; }));
  Audio.requestPermissionsAsync.mockResolvedValue({status:"denied"});
  const sound = {unloadAsync:jest.fn(async () => {}),playAsync:jest.fn(),setOnPlaybackStatusUpdate:jest.fn()};
  useApp.mockReturnValue(buildCtx("u1"));
  const ui=render(<NoteCreateScreen navigation={navigation} route={{params:{prefill:{title:"대사",content:"원문",practiceMode:"standard_speech",voiceRecordings:[{uri:"file:///take"}]}}}} />);
  await waitFor(() => expect(ui.getByTestId("speech-listen").props.accessibilityState.disabled).toBe(false));
  await act(async () => { fireEvent.press(ui.getByTestId("speech-take-0")); });
  expect(Audio.Sound.createAsync).toHaveBeenCalled();
  await act(async () => { fireEvent.press(ui.getByTestId(target)); });
  await act(async () => resolveSound({sound}));
  expect(sound.playAsync).not.toHaveBeenCalled(); expect(sound.unloadAsync).toHaveBeenCalledTimes(1);
});
