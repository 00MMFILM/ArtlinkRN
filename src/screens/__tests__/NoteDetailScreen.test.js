// 3단계 — 저장된 노트에서 "고칠 점 하나 고르기 → 이 포인트로 다시 연습",
// 그리고 재연습 노트의 "지난 연습" 카드.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
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
