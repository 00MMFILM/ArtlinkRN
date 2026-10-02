// 프리미엄 구독자에게도 외국어 로케일이면 배너 광고가 뜨던 문제.
// premium.active면 로케일과 무관하게 배너를 숨겨야 한다.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
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

// 1.11.9 — 게스트 기록은 기기에만 저장된다는 사실을 알리고 가입으로 보낸다
describe("NotesScreen — 게스트 기록 안내", () => {
  const note = { id: 1, title: "첫 기록", field: "acting", createdAt: new Date().toISOString() };

  it("게스트이고 기록이 있으면 안내가 뜨고, 누르면 가입 화면으로 간다", () => {
    const setAuthState = jest.fn();
    useApp.mockReturnValue(buildCtx({ savedNotes: [note], userProfile: {}, setAuthState }));
    const { getByText } = render(<NotesScreen navigation={navigation} />);
    fireEvent.press(getByText("notes.guest_local_notice"));
    expect(setAuthState).toHaveBeenCalledWith("auth");
  });

  it("기록이 없거나 로그인한 사용자에게는 뜨지 않는다", () => {
    useApp.mockReturnValue(buildCtx({ savedNotes: [], userProfile: {} }));
    expect(render(<NotesScreen navigation={navigation} />).queryByText("notes.guest_local_notice")).toBeNull();
    useApp.mockReturnValue(buildCtx({ savedNotes: [note], userProfile: { authUserId: "u1" } }));
    expect(render(<NotesScreen navigation={navigation} />).queryByText("notes.guest_local_notice")).toBeNull();
  });
});
