import React from "react";
import { render } from "@testing-library/react-native";
import HomeScreen from "../HomeScreen";
import { useApp } from "../../context/AppContext";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const buildCtx = (savedNotes) => ({
  savedNotes,
  handleSaveNote: jest.fn(),
  userProfile: { name: "홍길동", fields: ["music"] },
  artistProfile: {},
  fieldOrder: [],
  isKoreanLocale: false,
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

describe("HomeScreen — 0노트 히어로 카드", () => {
  beforeEach(() => jest.clearAllMocks());

  it("노트가 0개면 히어로 CTA만 보이고 주간 요약·빈 상태 카드·최근 노트 헤더는 없다", () => {
    useApp.mockReturnValue(buildCtx([]));
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title")).toBeTruthy();
    expect(queryByText("home.hero_cta")).toBeTruthy();
    expect(queryByText("home.weekly_summary")).toBeNull();
    expect(queryByText("home.empty_title")).toBeNull();
    expect(queryByText("home.recent_notes")).toBeNull();
  });

  it("노트가 1개면 주간 요약과 최근 노트가 보이고 히어로는 없다", () => {
    useApp.mockReturnValue(
      buildCtx([{ id: "n1", title: "첫 노트", field: "music", createdAt: new Date().toISOString() }])
    );
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.weekly_summary")).toBeTruthy();
    expect(queryByText("home.recent_notes")).toBeTruthy();
    expect(queryByText("첫 노트")).toBeTruthy();
    expect(queryByText("home.hero_title")).toBeNull();
    expect(queryByText("home.hero_cta")).toBeNull();
  });
});
