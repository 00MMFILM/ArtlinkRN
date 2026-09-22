// 홈 "이번 주 요약"·성장 리포트가 저장된 노트만 세던 문제 — 2인 대사처럼 노트를 안 남기는
// 연습도 기기 연습 기록(getPracticeLog)으로 잡히게 하는 병합 유틸의 재현 테스트.
import {
  buildPracticeActivities,
  countActivitiesByKind,
  computeActivityStreak,
  computeActivityWeekStats,
  computeActivityMonthly,
} from "../practiceStats";

const iso = (d) => new Date(d).toISOString();

describe("buildPracticeActivities", () => {
  it("(a) 노트 없이 2인 대사 3회 완료 — 3개 모두 잡힌다", () => {
    const log = [
      { sessionId: "d1", kind: "duet", at: iso("2026-09-20") },
      { sessionId: "d2", kind: "duet", at: iso("2026-09-21") },
      { sessionId: "d3", kind: "duet", at: iso("2026-09-22") },
    ];
    const activities = buildPracticeActivities([], log);
    expect(activities).toHaveLength(3);
  });

  it("(b) 2인 대사 → 같은 sessionId로 노트 저장 = 1회로만 센다", () => {
    const notes = [{ id: "n1", createdAt: iso("2026-09-22"), practiceSessionId: "d1" }];
    const log = [{ sessionId: "d1", kind: "duet", at: iso("2026-09-22") }];
    const activities = buildPracticeActivities(notes, log);
    expect(activities).toHaveLength(1);
  });

  it("(c) 예전 노트 2개(practiceSessionId 없음) + 2인 대사 1회 = 3", () => {
    const notes = [
      { id: "n1", createdAt: iso("2026-09-20") },
      { id: "n2", createdAt: iso("2026-09-21") },
    ];
    const log = [{ sessionId: "d1", kind: "duet", at: iso("2026-09-22") }];
    const activities = buildPracticeActivities(notes, log);
    expect(activities).toHaveLength(3);
  });

  it("연습 기록 중 노트가 없는 세션만 남기고, 노트로 흡수된 세션은 뺀다(부분 중복)", () => {
    const notes = [{ id: "n1", createdAt: iso("2026-09-22"), practiceSessionId: "d1" }];
    const log = [
      { sessionId: "d1", kind: "duet", at: iso("2026-09-22") }, // 노트로 흡수 — 제외
      { sessionId: "d2", kind: "duet", at: iso("2026-09-21") }, // 노트 없음 — 포함
    ];
    const activities = buildPracticeActivities(notes, log);
    expect(activities).toHaveLength(2);
  });

  it("sessionId나 at이 없는 기록은 무시한다", () => {
    const activities = buildPracticeActivities([], [{ sessionId: "d1", kind: "duet" }, { at: iso("2026-09-22"), kind: "duet" }]);
    expect(activities).toHaveLength(0);
  });
});

describe("countActivitiesByKind", () => {
  it("kind가 일치하는 항목만 센다", () => {
    const log = [
      { sessionId: "d1", kind: "duet", at: iso("2026-09-20") },
      { sessionId: "d2", kind: "duet", at: iso("2026-09-21") },
      { sessionId: "c1", kind: "checkin", at: iso("2026-09-21") },
    ];
    expect(countActivitiesByKind(log, "duet")).toBe(2);
    expect(countActivitiesByKind(log, "checkin")).toBe(1);
    expect(countActivitiesByKind(log, "video")).toBe(0);
  });
});

describe("computeActivityStreak / computeActivityWeekStats", () => {
  // 이번 주 일요일 기준으로 고정 "오늘"을 화요일로 둬 주 경계에 안전하게 만든다.
  const now = (() => {
    const d = new Date();
    // 오늘 요일이 일요일(0)이면 streak/week 경계 테스트가 불안정하므로 화요일로 이동
    const day = d.getDay();
    d.setDate(d.getDate() - day + 2);
    d.setHours(12, 0, 0, 0);
    return d;
  })();
  const today = (h = 0) => new Date(now.getTime() + h * 3600000).toISOString();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  it("(d) 연속 기록이 노트 날짜와 2인 대사 날짜의 합집합으로 계산된다", () => {
    // 노트: 오늘 / 2인 대사: 어제 → 연속 2일
    const activities = buildPracticeActivities(
      [{ id: "n1", createdAt: today() }],
      [{ sessionId: "d1", kind: "duet", at: daysAgo(1) }]
    );
    expect(computeActivityStreak(activities, now)).toBe(2);
  });

  it("활동이 하루라도 끊기면 거기서 멈춘다", () => {
    const activities = [{ createdAt: today() }, { createdAt: daysAgo(2) }]; // 어제(1일 전) 없음
    expect(computeActivityStreak(activities, now)).toBe(1);
  });

  it("오늘 활동이 없으면 어제부터 거슬러 센다", () => {
    const activities = [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(2) }];
    expect(computeActivityStreak(activities, now)).toBe(2);
  });

  it("이번 주 활동 수와 지난주 대비 성장률을 계산한다", () => {
    const activities = [
      { createdAt: today() },
      { createdAt: daysAgo(1) },
      { createdAt: daysAgo(9) }, // 지난주
    ];
    const { weekActivities, weekGrowth } = computeActivityWeekStats(activities, now);
    expect(weekActivities).toHaveLength(2);
    expect(weekGrowth).toBe(100); // 지난주 1 → 이번주 2
  });
});

describe("computeActivityMonthly", () => {
  it("월별로 활동 수를 센다", () => {
    const activities = [
      { createdAt: "2026-09-01T00:00:00.000Z" },
      { createdAt: "2026-09-15T00:00:00.000Z" },
      { createdAt: "2026-08-30T00:00:00.000Z" },
    ];
    expect(computeActivityMonthly(activities)).toEqual({ "2026-09": 2, "2026-08": 1 });
  });
});

describe("월별 집계 — 현지 기준 달", () => {
  it("현지 기준 이번 달 기록은 이번 달 키로 모인다", () => {
    const now = new Date();
    const firstOfMonthMorning = new Date(now.getFullYear(), now.getMonth(), 1, 0, 30); // 현지 1일 00:30
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const m = computeActivityMonthly([{ createdAt: firstOfMonthMorning.toISOString() }, { createdAt: now.toISOString() }]);
    expect(m[key]).toBe(2);
  });
});


// 프로필·포트폴리오·공유카드·서버 전송 streakDays가 노트만 세서 홈과 숫자가 달랐던 문제 —
// AppContext가 artistProfile의 활동량 값(연속·이번 주·월별)만 합산 기준으로 덮는다.
describe("applyPracticeActivityStats — artistProfile 활동량 값 합산", () => {
  const { computeArtistProfile } = require("../../services/analyticsService");
  const { applyPracticeActivityStats } = require("../practiceStats");
  const now = new Date();
  const at = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 12).toISOString();

  it("연습 기록만 있는 사용자(2인 대사만)의 streak가 홈 합산 계산과 같다", () => {
    const notes = [];
    const log = [0, 1, 2].map((n) => ({ sessionId: `d${n}`, kind: "duet", field: "acting", at: at(n) }));
    const base = computeArtistProfile(notes, {});
    expect(base.streak).toBe(0); // 수정 전: 프로필 0일

    const p = applyPracticeActivityStats(base, notes, log, now);
    const activities = buildPracticeActivities(notes, log);
    expect(p.streak).toBe(computeActivityStreak(activities, now));
    expect(p.streak).toBe(3); // 홈 "3일"과 같은 숫자
    expect(p.weekGrowth).toBe(computeActivityWeekStats(activities, now).weekGrowth);
    expect(p.monthlyActivity).toEqual(computeActivityMonthly(activities));
    // 점수·마일리지 같은 노트 내용 기반 값은 그대로
    expect(p.overallScore).toBe(base.overallScore);
    expect(p.mileage).toBe(base.mileage);
    expect(p.radarValues).toEqual(base.radarValues);
  });

  it("연습 기록이 없거나 전부 노트와 같은 세션이면 기존 값이 그대로다(같은 객체)", () => {
    const notes = [
      { id: 1, field: "acting", content: "a", createdAt: at(0), practiceSessionId: "s1" },
      { id: 2, field: "acting", content: "b", createdAt: at(1) },
    ];
    const base = computeArtistProfile(notes, {});
    expect(applyPracticeActivityStats(base, notes, [], now)).toBe(base);
    expect(applyPracticeActivityStats(base, notes, [{ sessionId: "s1", kind: "text", at: at(0) }], now)).toBe(base);
  });

  it("노트와 연습 기록이 섞이면 중복 세션은 1회로, 연속은 합산으로 센다", () => {
    const notes = [{ id: 1, field: "acting", content: "a", createdAt: at(0), practiceSessionId: "s1" }];
    const log = [{ sessionId: "s1", kind: "text", at: at(0) }, { sessionId: "d1", kind: "duet", at: at(1) }];
    const base = computeArtistProfile(notes, {});
    expect(base.streak).toBe(1);
    const p = applyPracticeActivityStats(base, notes, log, now);
    expect(p.streak).toBe(2);
    expect(p.noteScore).toBe(base.noteScore);
  });
});
