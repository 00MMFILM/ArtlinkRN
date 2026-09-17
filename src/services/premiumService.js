import { SERVER_URL, getApiHeaders } from "./apiConfig";

/**
 * 프리미엄 상태 — 앱이 화면에 쓰는 유일한 정본.
 *
 * 2026-09-17까지 앱은 프리미엄 여부를 어디서도 읽지 않았다. 서버(premium_members)는
 * 프리미엄으로 판정하고 한도(텍스트 하루 10회·영상 월 15회)까지 적용하는데,
 * 앱 화면은 결제 전과 완전히 똑같아서 실구독자가 "결제가 안 됐다"고 느꼈다.
 *
 * source: "server"  — usage-status 응답 기준(정본)
 *         "purchase" — 결제·복원 직후 RevenueCat 기준(서버 웹훅 반영 전 임시)
 */
export const EMPTY_PREMIUM = Object.freeze({
  active: false,
  kind: null,   // "sub" | "comp" | null
  plan: null,   // "monthly" | "yearly" | null
  since: null,  // ISO 문자열
  source: null,
});

/**
 * usage-status 응답 → 프리미엄 상태.
 * 판정할 수 없으면 null을 돌려준다(호출부는 이전 값을 유지해 깜빡임을 막는다).
 */
export function parsePremiumStatus(data) {
  if (!data || typeof data !== "object") return null;

  const p = data.premium;
  if (p && typeof p === "object") {
    return {
      active: !!p.active,
      kind: p.kind || null,
      plan: p.plan || null,
      since: p.since || null,
      source: "server",
    };
  }
  // 구서버 폴백 — premium 계약이 배포되기 전 응답에는 unlimited만 있다.
  if (typeof data.unlimited === "boolean") {
    return { active: data.unlimited, kind: null, plan: null, since: null, source: "server" };
  }
  return null;
}

/** 서버에서 프리미엄 상태 조회. 실패·판정불가면 null. */
export async function fetchPremiumStatus() {
  try {
    const res = await fetch(`${SERVER_URL}/api/usage-status`, { headers: getApiHeaders() });
    if (!res.ok) return null;
    return parsePremiumStatus(await res.json());
  } catch (_) {
    return null;
  }
}

/**
 * 커뮤니티 왕관용 — 활성 프리미엄 사용자 id 집합.
 *
 * community_posts에는 author_premium 컬럼이 없다(실측: PostgREST 400). 글에 저장하는 대신
 * 서버가 주는 활성 프리미엄 id 목록으로 그린다. 목록을 못 받으면 배지를 안 그릴 뿐, 오류는 아니다.
 */
const PREMIUM_IDS_TTL_MS = 5 * 60 * 1000;
let _premiumIdsCache = null; // { ids: Set<string>, ts: number }

/** 테스트·로그아웃용 캐시 비우기. */
export function clearPremiumUserIdsCache() {
  _premiumIdsCache = null;
}

/**
 * 활성 프리미엄 사용자 id 조회. 5분 캐시. 실패하면 null.
 * @param {{ force?: boolean }} [opts] force면 캐시를 무시하고 다시 받는다.
 * @returns {Promise<Set<string>|null>}
 */
export async function fetchPremiumUserIds({ force = false } = {}) {
  if (!force && _premiumIdsCache && Date.now() - _premiumIdsCache.ts < PREMIUM_IDS_TTL_MS) {
    return _premiumIdsCache.ids;
  }
  try {
    const res = await fetch(`${SERVER_URL}/api/premium-badges`, { headers: getApiHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.userIds)) return null;

    const ids = new Set(data.userIds.filter((id) => typeof id === "string" && id));
    const generatedAt = Date.parse(data.generatedAt);
    _premiumIdsCache = { ids, ts: Number.isNaN(generatedAt) ? Date.now() : generatedAt };
    return ids;
  } catch (_) {
    return null;
  }
}

// 결제·복원 직후 낙관적으로 켠 active를, 웹훅 반영 전 서버의 false가 덮어쓰지 않게 막는다.
// optimisticUntil(ms) 안에서는 서버가 false를 돌려줘도 무시하고, active:true(서버 정본)는 즉시 반영.
export const PREMIUM_OPTIMISTIC_MS = 3 * 60 * 1000;
export function shouldApplyServerPremium(next, optimisticUntil, now = Date.now()) {
  if (!next) return false;
  if (next.active) return true;
  return !(optimisticUntil && now < optimisticUntil);
}
