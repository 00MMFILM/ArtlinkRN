// 노트(savedNotes) + 기기에 남은 연습 기록(practiceService.getPracticeLog)을 하나의
// "연습 활동" 목록으로 합친다. 홈 "이번 주 요약"·성장 리포트의 연습 횟수·연속 기록·주간 성장이
// 저장된 노트만 세던 문제를 고친다 — 2인 대사 연습처럼 노트를 남기지 않는 연습도 잡히게 한다.
//
// 중복 방지: 노트가 practiceSessionId를 갖고 있으면(2인 대사 → 노트 저장 등) 같은 sessionId의
// 연습 기록은 빼서 1회로만 센다. practiceSessionId가 없는 노트(예전 노트)는 항상 그대로 포함된다.

/**
 * @param {Array} notes - AppContext의 savedNotes
 * @param {Array} practiceLog - practiceService.getPracticeLog()의 결과 [{ sessionId, kind, field, at }]
 * @param {string} noteDateField - 노트에서 날짜로 쓸 필드명 (기본 createdAt)
 * @returns {Array<{ createdAt: string, kind: string|null }>}
 */
export function buildPracticeActivities(notes = [], practiceLog = [], noteDateField = "createdAt") {
  const loggedSessionIds = new Set(
    (notes || [])
      .map((n) => n && n.practiceSessionId)
      .filter((id) => id !== null && id !== undefined)
  );

  const noteActivities = (notes || [])
    .filter((n) => n && n[noteDateField])
    .map((n) => ({ createdAt: n[noteDateField], kind: n.type || null }));

  const logActivities = (practiceLog || [])
    .filter((e) => e && e.at && e.sessionId && !loggedSessionIds.has(e.sessionId))
    .map((e) => ({ createdAt: e.at, kind: e.kind || null }));

  return [...noteActivities, ...logActivities];
}

/** kind별 개수 (예: 2인 대사 연습 N회) — practiceLog나 활동 목록 어느 쪽에도 쓸 수 있다. */
export function countActivitiesByKind(activities = [], kind) {
  return (activities || []).filter((a) => a && a.kind === kind).length;
}

// ── 아래는 analyticsService.computeArtistProfile의 연속기록/주간 통계와 같은 공식을
// savedNotes 대신 buildPracticeActivities()의 결과(활동 목록)에 적용한 버전이다.
// GrowthScreen에서 "연습 횟수/빈도/연속"처럼 노트 내용이 필요 없는 지표에만 쓴다.

/** 연속 기록 — 오늘부터 거슬러 활동이 끊기지 않은 날 수 */
export function computeActivityStreak(activities = [], now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hasToday = (activities || []).some((a) => a.createdAt && new Date(a.createdAt) >= todayStart);
  let streak = 0;
  for (let i = hasToday ? 0 : 1; i < 365; i++) {
    const ds = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const de = new Date(ds.getTime() + 86400000);
    const hasDay = (activities || []).some((a) => {
      if (!a.createdAt) return false;
      const d = new Date(a.createdAt);
      return d >= ds && d < de;
    });
    if (hasDay) streak++;
    else break;
  }
  return streak;
}

/** 이번 주 활동 목록 + 지난주 대비 성장률(%) */
export function computeActivityWeekStats(activities = [], now = new Date()) {
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekActivities = (activities || []).filter((a) => a.createdAt && new Date(a.createdAt) >= weekStart);

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekActivities = (activities || []).filter((a) => {
    if (!a.createdAt) return false;
    const d = new Date(a.createdAt);
    return d >= lastWeekStart && d < weekStart;
  });

  const weekGrowth = lastWeekActivities.length > 0
    ? Math.round(((weekActivities.length - lastWeekActivities.length) / lastWeekActivities.length) * 100)
    : weekActivities.length > 0 ? 100 : 0;

  return { weekActivities, weekGrowth };
}

/** 월별 활동 수 { "YYYY-MM": count } */
export function computeActivityMonthly(activities = []) {
  const monthly = {};
  (activities || []).forEach((a) => {
    if (!a.createdAt) return;
    const d = new Date(a.createdAt);
    if (Number.isNaN(d.getTime())) return;
    // 기기 현지 기준 달 — UTC로 자르면 한국에서 매달 1일 오전 9시 전 기록이 전달로 들어가고, 차트 키와도 어긋난다
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly[mk] = (monthly[mk] || 0) + 1;
  });
  return monthly;
}

/**
 * artistProfile(computeArtistProfile 결과)의 연습 활동량 값(streak·weekGrowth·monthlyActivity)만
 * 노트+연습 기록 합산 기준으로 덮는다. 점수·마일리지·분야 분포 등 노트 내용 기반 값은 그대로 둔다.
 * 노트에 없는 연습 기록이 하나도 없으면 profile을 그대로(같은 객체) 돌려준다 — 기존 사용자 값 불변.
 */
export function applyPracticeActivityStats(profile, notes = [], practiceLog = [], now = new Date()) {
  const activities = buildPracticeActivities(notes, practiceLog);
  const noteCount = (notes || []).filter((n) => n && n.createdAt).length;
  if (activities.length === noteCount) return profile;
  return {
    ...profile,
    streak: computeActivityStreak(activities, now),
    weekGrowth: computeActivityWeekStats(activities, now).weekGrowth,
    monthlyActivity: computeActivityMonthly(activities),
  };
}
