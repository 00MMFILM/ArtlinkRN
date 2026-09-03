import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
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
  VideoExportPreset: { Passthrough: 0 },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-av", () => ({ Audio: { Recording: jest.fn(), Sound: {}, setAudioModeAsync: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/TopBar", () => "TopBar");

const { analyzeNote } = require("../../services/aiService");
const AsyncStorage = require("@react-native-async-storage/async-storage");

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

const runAi = async (utils) => {
  fireEvent.changeText(utils.getByPlaceholderText("noteCreate.content_placeholder"), "오늘 연습");
  fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
};

describe("NoteCreateScreen — 첫 AI 피드백 직후 안내", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    analyzeNote.mockResolvedValue({ analysis: "좋아요", scores: null });
    hasAskedReminder.mockResolvedValue(false);
  });

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
    cta.onPress();
    expect(trackFunnelEvent).toHaveBeenCalledWith("signup_nudge_tapped", "ko");
    expect(setAuthState).toHaveBeenCalledWith("auth");

    // 두 번째 AI 성공에는 뜨지 않는다
    Alert.alert.mockClear();
    fireEvent.press(utils.getByText("noteCreate.ai_analyze"));
    await waitFor(() => expect(analyzeNote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledTimes(2));
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
