// 프리미엄 구독자에게도 외국어 로케일이면 배너 광고가 뜨던 문제.
// premium.active면 로케일과 무관하게 배너를 숨겨야 한다.
import React from "react";
import { render } from "@testing-library/react-native";
import NotesScreen from "../NotesScreen";
import { useApp } from "../../context/AppContext";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("react-native-google-mobile-ads", () => {
  const React = require("react");
  const RN = require("react-native");
  return {
    BannerAd: (props) => React.createElement(RN.View, { testID: "banner-ad", ...props }),
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: "ANCHORED_ADAPTIVE_BANNER" },
  };
});
jest.mock("../../services/adService", () => ({ AD_UNITS: { BANNER: "banner-unit" } }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});

const navigation = { navigate: jest.fn() };

const buildCtx = (overrides = {}) => ({
  savedNotes: [],
  handleDeleteNote: jest.fn(),
  handleToggleStar: jest.fn(),
  fieldOrder: [],
  isKoreanLocale: false,
  premium: { active: false },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("NotesScreen — 프리미엄 배너 광고 숨김", () => {
  it("외국어 로케일 + 무료 사용자는 배너가 뜬다", () => {
    useApp.mockReturnValue(buildCtx());
    const utils = render(<NotesScreen navigation={navigation} />);
    expect(utils.queryByTestId("banner-ad")).toBeTruthy();
  });

  it("외국어 로케일 + 프리미엄 구독자는 배너가 뜨지 않는다", () => {
    useApp.mockReturnValue(buildCtx({ premium: { active: true } }));
    const utils = render(<NotesScreen navigation={navigation} />);
    expect(utils.queryByTestId("banner-ad")).toBeNull();
  });

  it("한국어 로케일은 프리미엄 여부와 무관하게 배너가 뜨지 않는다", () => {
    useApp.mockReturnValue(buildCtx({ isKoreanLocale: true, premium: { active: false } }));
    const utils = render(<NotesScreen navigation={navigation} />);
    expect(utils.queryByTestId("banner-ad")).toBeNull();
  });
});
