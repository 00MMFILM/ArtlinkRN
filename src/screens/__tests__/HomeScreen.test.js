import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import HomeScreen from "../HomeScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";
import { startPractice, completePractice } from "../../services/practiceService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/practiceService", () => ({
  startPractice: jest.fn(() => ({ sessionId: "sess-home", kind: "checkin" })),
  completePractice: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const buildCtx = (savedNotes, premium = { active: false }) => ({
  savedNotes,
  handleSaveNote: jest.fn(),
  userProfile: { name: "홍길동", fields: ["music"] },
  artistProfile: {},
  fieldOrder: [],
  isKoreanLocale: false,
  premium,
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

// 홈의 빠른 체크인도 노트 저장이다 — 계측이 빠져 있어 활성화 지표가 과소 집계되던 버그(2026-09-07)
describe("HomeScreen — 빠른 체크인 계측", () => {
  beforeEach(() => jest.clearAllMocks());

  it("체크인 저장 시 노트 저장과 함께 note_saved 이벤트를 보낸다", () => {
    const ctx = buildCtx([]);
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music"));
    fireEvent.press(getByText("common.save"));

    expect(ctx.handleSaveNote).toHaveBeenCalledWith(
      expect.objectContaining({ field: "music", type: "checkin" })
    );
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
  });
});

// 2단계 — 반복 연습 측정. 체크인도 "연습 한 번"이라 시작·완료가 한 세션으로 묶여야 한다.
describe("HomeScreen — 체크인 연습 세션", () => {
  beforeEach(() => jest.clearAllMocks());

  it("분야 원을 펼칠 때 세션이 시작되고, 저장 시 같은 세션이 완료된다", () => {
    const ctx = buildCtx([]);
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music"));
    expect(startPractice).toHaveBeenCalledWith("checkin", "music", "music");

    fireEvent.press(getByText("common.save"));
    expect(completePractice).toHaveBeenCalledTimes(1);
    expect(completePractice.mock.calls[0][0].sessionId).toBe("sess-home");
    // 기존 최초 1회 통계는 그대로 남는다
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
  });

  it("원을 접을 때는 세션을 새로 시작하지 않는다", () => {
    useApp.mockReturnValue(buildCtx([]));
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music")); // 펼침
    fireEvent.press(getByText("fields.music")); // 접음
    expect(startPractice).toHaveBeenCalledTimes(1);
    expect(completePractice).not.toHaveBeenCalled();
  });
});

// 결제한 사용자가 앱 어디서도 티가 안 나던 문제(2026-09-17) — 인사말에 왕관이 붙는다.
describe("HomeScreen — 프리미엄 왕관 배지", () => {
  beforeEach(() => jest.clearAllMocks());

  it("프리미엄이면 인사말 이름 앞에 왕관이 보인다", () => {
    useApp.mockReturnValue(buildCtx([], { active: true, kind: "sub", plan: "yearly" }));
    const { queryByTestId } = render(<HomeScreen navigation={navigation} />);
    expect(queryByTestId("premium-badge")).toBeTruthy();
  });

  it("비프리미엄이면 왕관이 없다", () => {
    useApp.mockReturnValue(buildCtx([], { active: false }));
    const { queryByTestId } = render(<HomeScreen navigation={navigation} />);
    expect(queryByTestId("premium-badge")).toBeNull();
  });
});
