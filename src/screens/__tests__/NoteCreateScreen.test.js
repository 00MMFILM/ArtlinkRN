import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import NoteCreateScreen from "../NoteCreateScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";
import { hasAskedReminder } from "../../services/reminderService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/aiService", () => ({
  analyzeNote: jest.fn(),
  analyzeVideoFrames: jest.fn(),
  lastAiMeta: {},
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
const buildCtx = (authUserId) => ({
  handleSaveNote: jest.fn(),
  savedNotes: [],
  userProfile: authUserId ? { authUserId } : {},
  aiDisclosureAccepted: true,
  handleAcceptAIDisclosure: jest.fn(),
  isKoreanLocale: true,
  setAuthState,
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
