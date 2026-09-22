// 성장 리포트의 "연습 횟수/빈도/연속" 지표가 저장된 노트만 세던 문제를 고친다.
// 2인 대사 연습(노트를 안 남기는 연습)도 기기 연습 기록(getPracticeLog)으로 잡혀야 한다.
// AI 분석 점수·5축 점수(overallScore 등)는 노트 내용이 필요해 artistProfile 값 그대로 써야 한다.
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import GrowthScreen from "../GrowthScreen";
import { useApp } from "../../context/AppContext";
import { getPracticeLog } from "../../services/practiceService";

// t(key, {count})를 "key:{...}" 문자열로 만들어, 화면에 실제로 어떤 값이 넘어갔는지 텍스트로 검증한다.
const tKey = (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/practiceService", () => ({
  getPracticeLog: jest.fn(() => Promise.resolve([])),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }) => children,
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };

const baseArtistProfile = {
  overallScore: 42,
  noteScore: 15,
  aiScore: 20,
  diversityScore: 40,
  depthScore: 33,
  consistencyScore: 24,
  fieldCounts: { acting: 3 },
  topTags: [],
  displayName: "테스터",
  level: 2,
  mileage: 120,
  nextLevelAt: 200,
  mileageProgress: 0.5,
};

const buildCtx = (savedNotes) => ({
  artistProfile: baseArtistProfile,
  savedNotes,
});

describe("GrowthScreen — 연습 활동(노트+연습 기록) 기준 이번 주/연속", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("(a) 노트 없이 2인 대사만 3회 완료하면 이번 주 연습 수가 3이다", async () => {
    const now = new Date().toISOString();
    getPracticeLog.mockResolvedValueOnce([
      { sessionId: "d1", kind: "duet", at: now },
      { sessionId: "d2", kind: "duet", at: now },
      { sessionId: "d3", kind: "duet", at: now },
    ]);
    useApp.mockReturnValue(buildCtx([]));
    const { findByText } = render(<GrowthScreen navigation={navigation} />);

    expect(await findByText(tKey("growth.this_week_value", { count: 3 }))).toBeTruthy();
  });

  it("(b) 2인 대사 → 같은 세션 id로 노트 저장 = 1회로만 센다(중복 방지)", async () => {
    const now = new Date().toISOString();
    getPracticeLog.mockResolvedValueOnce([{ sessionId: "d1", kind: "duet", at: now }]);
    useApp.mockReturnValue(
      buildCtx([{ id: "n1", field: "acting", createdAt: now, practiceSessionId: "d1" }])
    );
    const { findByText } = render(<GrowthScreen navigation={navigation} />);

    expect(await findByText(tKey("growth.this_week_value", { count: 1 }))).toBeTruthy();
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
    const { findByText } = render(<GrowthScreen navigation={navigation} />);

    expect(await findByText(tKey("growth.this_week_value", { count: 3 }))).toBeTruthy();
  });

  it("2인 대사 기록이 있으면 '2인 대사 연습 N회' 줄이 뜬다", async () => {
    const now = new Date().toISOString();
    getPracticeLog.mockResolvedValueOnce([
      { sessionId: "d1", kind: "duet", at: now },
      { sessionId: "d2", kind: "duet", at: now },
    ]);
    useApp.mockReturnValue(buildCtx([]));
    const { findByText } = render(<GrowthScreen navigation={navigation} />);

    expect(await findByText(tKey("growth.duet_count", { count: 2 }), { exact: false })).toBeTruthy();
  });

  it("2인 대사 기록이 없으면 duet_count 줄을 그리지 않는다", async () => {
    getPracticeLog.mockResolvedValueOnce([]);
    useApp.mockReturnValue(buildCtx([]));
    const { queryByText } = render(<GrowthScreen navigation={navigation} />);

    await waitFor(() => expect(getPracticeLog).toHaveBeenCalled());
    expect(queryByText(tKey("growth.duet_count", { count: 0 }), { exact: false })).toBeNull();
  });

  it("AI 분석·5축 점수는 노트 내용 기반 그대로(artistProfile 값) — 연습 기록과 무관하게 안 바뀐다", async () => {
    getPracticeLog.mockResolvedValueOnce([
      { sessionId: "d1", kind: "duet", at: new Date().toISOString() },
    ]);
    useApp.mockReturnValue(buildCtx([]));
    const { findByText } = render(<GrowthScreen navigation={navigation} />);

    expect(await findByText("42")).toBeTruthy(); // overallScore
    expect(await findByText("15")).toBeTruthy(); // noteScore
    expect(await findByText("20")).toBeTruthy(); // aiScore
  });
});
