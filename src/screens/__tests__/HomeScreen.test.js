import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import HomeScreen from "../HomeScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";
import { startPractice, completePractice, getPracticeLog } from "../../services/practiceService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/practiceService", () => ({
  startPractice: jest.fn(() => ({ sessionId: "sess-home", kind: "checkin" })),
  completePractice: jest.fn(),
  getPracticeLog: jest.fn(() => Promise.resolve([])),
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
  showToast: jest.fn(),
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };

describe("HomeScreen — 0노트 히어로 카드", () => {
  beforeEach(() => jest.clearAllMocks());

  it("노트가 0개면 히어로 CTA만 보이고 주간 요약·빈 상태 카드·최근 노트 헤더는 없다", async () => {
    useApp.mockReturnValue(buildCtx([]));
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title")).toBeTruthy();
    expect(queryByText("home.hero_cta")).toBeTruthy();
    expect(queryByText("home.weekly_summary")).toBeNull();
    expect(queryByText("home.empty_title")).toBeNull();
    expect(queryByText("home.recent_notes")).toBeNull();
  });

  it("노트가 1개면 주간 요약과 최근 노트가 보이고 히어로는 없다", async () => {
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

  it("체크인 저장 시 노트 저장과 함께 note_saved 이벤트를 보낸다", async () => {
    const ctx = buildCtx([]);
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music"));
    await act(async () => { fireEvent.press(getByText("common.save")); });

    expect(ctx.handleSaveNote).toHaveBeenCalledWith(
      expect.objectContaining({ field: "music", type: "checkin" })
    );
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
  });

  // 체크인 노트에도 세션 id가 실려야 요약·성장 리포트가 연습 기록과 중복 집계하지 않는다
  it("체크인 노트에 체크인 세션의 practiceSessionId가 실린다", async () => {
    const ctx = buildCtx([]);
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music"));
    await act(async () => { fireEvent.press(getByText("common.save")); });

    expect(ctx.handleSaveNote).toHaveBeenCalledWith(
      expect.objectContaining({ practiceSessionId: "sess-home" })
    );
  });
});

// 반복 연습 측정 3단계 — 2인 대사처럼 노트를 안 남기는 연습도 이번 주 요약·연속 기록에 잡혀야 한다
describe("HomeScreen — 이번 주 요약이 연습 기록(노트 없는 2인 대사 포함)을 센다", () => {
  beforeEach(() => jest.clearAllMocks());

  it("(a) 노트 없이 2인 대사만 3회 완료하면 이번 주 연습 수가 3이다", async () => {
    const now = new Date().toISOString();
    getPracticeLog.mockResolvedValueOnce([
      { sessionId: "d1", kind: "duet", at: now },
      { sessionId: "d2", kind: "duet", at: now },
      { sessionId: "d3", kind: "duet", at: now },
    ]);
    useApp.mockReturnValue(buildCtx([]));
    const { queryByText, findByText } = render(<HomeScreen navigation={navigation} />);

    await findByText("home.weekly_summary"); // 노트 0개라도 연습 기록이 있으면 히어로 대신 요약이 뜬다
    expect(queryByText("home.hero_title")).toBeNull();
    expect(queryByText("3")).toBeTruthy();
  });

  it("(b) 2인 대사 → 같은 세션 id로 노트 저장 = 1회로만 센다(중복 방지)", async () => {
    const now = new Date().toISOString();
    getPracticeLog.mockResolvedValueOnce([{ sessionId: "d1", kind: "duet", at: now }]);
    useApp.mockReturnValue(
      buildCtx([{ id: "n1", field: "acting", createdAt: now, practiceSessionId: "d1" }])
    );
    const { queryByText, findByText } = render(<HomeScreen navigation={navigation} />);

    await findByText("home.weekly_summary");
    expect(queryByText("1")).toBeTruthy();
    expect(queryByText("2")).toBeNull();
  });

  it("(c) 예전 노트 2개(practiceSessionId 없음) + 2인 대사 1회 = 3", async () => {
    const now = new Date().toISOString();
    getPracticeLog.mockResolvedValueOnce([{ sessionId: "d1", kind: "duet", at: now }]);
    useApp.mockReturnValue(
      buildCtx([
        { id: "n1", field: "acting", createdAt: now },
        { id: "n2", field: "acting", createdAt: now },
      ])
    );
    const { queryByText, findByText } = render(<HomeScreen navigation={navigation} />);

    await findByText("home.weekly_summary");
    expect(queryByText("3")).toBeTruthy();
  });

  it("(d) 연속 기록이 노트 날짜와 2인 대사 날짜의 합집합으로 계산된다", async () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    getPracticeLog.mockResolvedValueOnce([
      { sessionId: "d1", kind: "duet", at: yesterday.toISOString() },
    ]);
    useApp.mockReturnValue(
      buildCtx([{ id: "n1", field: "acting", createdAt: today.toISOString() }])
    );
    const { queryByText, findByText } = render(<HomeScreen navigation={navigation} />);

    await findByText("home.weekly_summary");
    // 오늘(노트)+어제(2인 대사)가 이어져 연속 2일
    expect(queryByText("2")).toBeTruthy();
  });

  it("포커스로 돌아올 때 연습 기록을 다시 읽는다", async () => {
    getPracticeLog.mockResolvedValueOnce([]);
    useApp.mockReturnValue(buildCtx([]));
    render(<HomeScreen navigation={navigation} />);

    expect(navigation.addListener).toHaveBeenCalledWith("focus", expect.any(Function));
    const focusHandler = navigation.addListener.mock.calls.find((c) => c[0] === "focus")[1];
    getPracticeLog.mockResolvedValueOnce([{ sessionId: "d1", kind: "duet", at: new Date().toISOString() }]);
    await act(async () => { focusHandler(); });

    expect(getPracticeLog).toHaveBeenCalledTimes(2);
  });
});

// 2단계 — 반복 연습 측정. 체크인도 "연습 한 번"이라 시작·완료가 한 세션으로 묶여야 한다.
describe("HomeScreen — 체크인 연습 세션", () => {
  beforeEach(() => jest.clearAllMocks());

  it("분야 원을 펼칠 때 세션이 시작되고, 저장 시 같은 세션이 완료된다", async () => {
    const ctx = buildCtx([]);
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music"));
    expect(startPractice).toHaveBeenCalledWith("checkin", "music", "music");

    await act(async () => { fireEvent.press(getByText("common.save")); });
    expect(completePractice).toHaveBeenCalledTimes(1);
    expect(completePractice.mock.calls[0][0].sessionId).toBe("sess-home");
    // 기존 최초 1회 통계는 그대로 남는다
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
  });

  it("원을 접을 때는 세션을 새로 시작하지 않는다", async () => {
    useApp.mockReturnValue(buildCtx([]));
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music")); // 펼침
    fireEvent.press(getByText("fields.music")); // 접음
    expect(startPractice).toHaveBeenCalledTimes(1);
    expect(completePractice).not.toHaveBeenCalled();
  });

  // 버그: 입력창을 연 채 다른 분야로 바꾸면 앞 세션의 시작 이벤트만 남고 완료가 안 됐다(2026-09-19)
  it("입력창을 연 채 다른 분야로 바꾸면 새 세션을 또 시작하지 않고 필드만 교체한다", async () => {
    const ctx = buildCtx([]);
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getByText("fields.music")); // 펼침 — 세션 시작
    expect(startPractice).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText("fields.acting")); // 열린 채로 다른 분야로 교체
    expect(startPractice).toHaveBeenCalledTimes(1); // 추가로 시작하지 않는다

    await act(async () => { fireEvent.press(getByText("common.save")); });
    expect(completePractice).toHaveBeenCalledTimes(1);
    // 교체된 필드(acting)로 완료된다 — 세션은 하나뿐이다
    expect(completePractice.mock.calls[0][1]).toEqual(
      expect.objectContaining({ field: "acting", subjectKey: "acting" })
    );
  });

  // 버그: 오늘 이미 체크인한 분야를 다시 눌러 저장하면 중복 노트가 생겼다(2026-09-19)
  it("오늘 이미 체크인한 분야를 다시 누르면 안내만 뜨고 입력창은 안 열린다", async () => {
    const today = new Date().toISOString();
    const ctx = buildCtx([{ id: "n1", field: "music", type: "checkin", createdAt: today }]);
    useApp.mockReturnValue(ctx);
    const { getAllByText, queryByText } = render(<HomeScreen navigation={navigation} />);

    fireEvent.press(getAllByText("fields.music")[0]);

    expect(ctx.showToast).toHaveBeenCalledWith("home.checkin_already", "success");
    expect(startPractice).not.toHaveBeenCalled();
    expect(queryByText("common.save")).toBeNull();
  });
});

// 결제한 사용자가 앱 어디서도 티가 안 나던 문제(2026-09-17) — 인사말에 왕관이 붙는다.
describe("HomeScreen — 프리미엄 왕관 배지", () => {
  beforeEach(() => jest.clearAllMocks());

  it("프리미엄이면 인사말 이름 앞에 왕관이 보인다", async () => {
    useApp.mockReturnValue(buildCtx([], { active: true, kind: "sub", plan: "yearly" }));
    const { queryByTestId } = render(<HomeScreen navigation={navigation} />);
    expect(queryByTestId("premium-badge")).toBeTruthy();
  });

  it("비프리미엄이면 왕관이 없다", async () => {
    useApp.mockReturnValue(buildCtx([], { active: false }));
    const { queryByTestId } = render(<HomeScreen navigation={navigation} />);
    expect(queryByTestId("premium-badge")).toBeNull();
  });
});

// 3단계 — 한국어 첫 경험: 노트 0개면 입시·오디션 맥락 문구 + 2인 대사 진입을 히어로 바로 아래
describe("HomeScreen — 한국어 첫 화면", () => {
  beforeEach(() => jest.clearAllMocks());

  it("한국어 + 노트 0개 + 분야 미설정(게스트)이면 입시·오디션 문구와 2인 대사 카드가 보인다", async () => {
    useApp.mockReturnValue({ ...buildCtx([]), isKoreanLocale: true, userProfile: { name: "손님", fields: [] } });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title_ko_acting")).toBeTruthy();
    expect(queryByText("home.hero_cta_ko_acting")).toBeTruthy();
    expect(queryByText("home.hero_title")).toBeNull();
    expect(queryByText("home.duet_title")).toBeTruthy();
  });

  it("한국어 + 노트 0개 + 연기 분야면 입시·오디션 문구와 2인 대사 카드가 보인다", async () => {
    useApp.mockReturnValue({
      ...buildCtx([]),
      isKoreanLocale: true,
      userProfile: { name: "배우", fields: ["acting"] },
    });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title_ko_acting")).toBeTruthy();
    expect(queryByText("home.duet_title")).toBeTruthy();
  });

  // 버그: 음악·미술 등 연기가 아닌 분야로 가입해도 "입시·오디션" 연기 문구가 떴다(2026-09-19)
  it("한국어 + 노트 0개라도 연기가 아닌 분야가 설정돼 있으면 일반 히어로를 보여준다", async () => {
    useApp.mockReturnValue({
      ...buildCtx([]),
      isKoreanLocale: true,
      userProfile: { name: "홍길동", fields: ["music"] },
    });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title_ko_acting")).toBeNull();
    expect(queryByText("home.hero_title")).toBeTruthy();
    expect(queryByText("home.duet_title")).toBeNull();
  });

  it("한국어라도 노트가 있으면 기존 화면 그대로 (2인 대사 카드는 연기 유저에게만)", async () => {
    useApp.mockReturnValue({
      ...buildCtx([{ id: "n1", title: "첫 노트", field: "music", createdAt: new Date().toISOString() }]),
      isKoreanLocale: true,
    });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title_ko_acting")).toBeNull();
    expect(queryByText("home.duet_title")).toBeNull();
  });

  it("다른 언어는 기존 문구 그대로", async () => {
    useApp.mockReturnValue(buildCtx([])); // isKoreanLocale: false
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.hero_title")).toBeTruthy();
    expect(queryByText("home.hero_title_ko_acting")).toBeNull();
    expect(queryByText("home.duet_title")).toBeNull();
  });

  // 버그: 히어로 카드 아래 duetCard가 뜨는데, 퀵노트 카드 맨 아래 줄에도 같은 진입이 중복으로 떴다(2026-09-19)
  it("연기 유저에게 히어로+duetCard가 뜨면 퀵노트 카드 맨 아래 중복 줄은 숨긴다", async () => {
    useApp.mockReturnValue({
      ...buildCtx([]),
      isKoreanLocale: true,
      userProfile: { name: "배우", fields: ["acting"] },
    });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.duet_title")).toBeTruthy(); // 상단 카드
    expect(queryByText("home.duet_row")).toBeNull(); // 하단 중복 줄은 없다
  });

  it("duetCard가 안 뜨는 비연기·기존 사용자에게는 하단 줄이 그대로 남는다", async () => {
    useApp.mockReturnValue({
      ...buildCtx([{ id: "n1", field: "music", createdAt: new Date().toISOString() }]),
      isKoreanLocale: true,
      userProfile: { name: "홍길동", fields: ["music"] },
    });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.duet_title")).toBeNull();
    expect(queryByText("home.duet_row")).toBeTruthy();
  });
});

// 매칭은 한국어 콘텐츠 — ProfileScreen처럼 홈 퀵액션에서도 비한국어면 숨긴다(2026-09-19)
describe("HomeScreen — 퀵액션 매칭 노출", () => {
  beforeEach(() => jest.clearAllMocks());

  it("한국어면 매칭 퀵액션이 보인다", async () => {
    useApp.mockReturnValue({ ...buildCtx([]), isKoreanLocale: true });
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.matching")).toBeTruthy();
  });

  it("비한국어면 매칭 퀵액션이 숨는다", async () => {
    useApp.mockReturnValue(buildCtx([])); // isKoreanLocale: false
    const { queryByText } = render(<HomeScreen navigation={navigation} />);
    expect(queryByText("home.matching")).toBeNull();
    // 나머지 퀵액션은 그대로
    expect(queryByText("home.new_note")).toBeTruthy();
    expect(queryByText("home.growth_report")).toBeTruthy();
  });
});
