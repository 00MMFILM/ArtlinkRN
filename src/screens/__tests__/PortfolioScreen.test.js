import React from "react";
import { Alert } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import PortfolioScreen from "../PortfolioScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";

// t 는 키를 그대로 반환 → 텍스트로 조회 가능
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/aiService", () => ({
  generatePortfolioSummary: jest.fn(),
  generateStructuredPortfolio: jest.fn(),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  VideoExportPreset: { Passthrough: 0 },
}));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/TopBar", () => "TopBar");
jest.mock("../../components/EmptyState", () => "EmptyState");

const buildCtx = (fields) => ({
  artistProfile: {
    displayName: "홍길동",
    displayFields: "연기",
    topFields: [],
    noteScore: 0,
    aiScore: 0,
    diversityScore: 0,
    depthScore: 0,
    consistencyScore: 0,
    overallScore: 0,
    streak: 0,
    featuredNotes: [],
  },
  userProfile: { name: "홍길동", fields },
  savedNotes: [],
  portfolioItems: [],
  portfolioSummary: null,
  handleAddPortfolioItem: jest.fn(),
  handleDeletePortfolioItem: jest.fn(),
  handleUpdatePortfolioSummary: jest.fn(),
});

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

describe("PortfolioScreen — AI 영상 프로필 (배우 전용)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("배우(연기 전공)에게는 준비중 카드가 노출된다", () => {
    useApp.mockReturnValue(buildCtx(["acting"]));
    const { queryByText } = render(<PortfolioScreen navigation={navigation} />);
    expect(queryByText("portfolio.video_profile_notify")).toBeTruthy();
  });

  it("배우가 아니면 카드가 노출되지 않는다", () => {
    useApp.mockReturnValue(buildCtx(["music"]));
    const { queryByText } = render(<PortfolioScreen navigation={navigation} />);
    expect(queryByText("portfolio.video_profile_notify")).toBeNull();
  });

  it("알림 신청을 누르면 퍼널 이벤트가 기록되고 버튼이 완료 상태로 바뀐다", () => {
    useApp.mockReturnValue(buildCtx(["acting"]));
    const { getByText, queryByText } = render(
      <PortfolioScreen navigation={navigation} />
    );

    fireEvent.press(getByText("portfolio.video_profile_notify"));

    expect(trackFunnelEvent).toHaveBeenCalledWith("ai_video_profile_interest", "ko");
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    // 버튼이 완료 상태 텍스트로 전환
    expect(queryByText("portfolio.video_profile_requested")).toBeTruthy();
    expect(queryByText("portfolio.video_profile_notify")).toBeNull();
  });
});
