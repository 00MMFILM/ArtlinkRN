// 실구독자 2명이 결제했는데 앱이 "결제 전과 똑같다" — 앱이 프리미엄 여부를 아예 안 읽던 버그(2026-09-17).
// 서버 usage-status의 premium 계약을 앱이 제대로 해석하는지, 구서버/실패에서도 안 깨지는지 검사.
jest.mock("../supabaseClient", () => ({ supabase: {}, getAuthToken: () => null }));
jest.mock("../apiConfig", () => ({
  SERVER_URL: "https://artlink-server.vercel.app",
  getApiHeaders: () => ({ "Content-Type": "application/json", "X-App-Token": "t" }),
}));
jest.mock("../purchasesService", () => ({ checkPremium: jest.fn(async () => false) }));

const { parsePremiumStatus, parseUsage, fetchUsageStatus, mergeRcPremium, requestPremiumResync, syncStorePremium, EMPTY_PREMIUM, shouldApplyServerPremium, PREMIUM_OPTIMISTIC_MS } = require("../premiumService");
const { checkPremium } = require("../purchasesService");

describe("parsePremiumStatus — 신·구 서버 응답 파싱", () => {
  it("신서버 premium 필드를 그대로 읽는다", () => {
    const p = parsePremiumStatus({
      unlimited: true,
      premium: { active: true, kind: "sub", plan: "yearly", since: "2026-09-01T00:00:00.000Z" },
    });
    expect(p).toEqual({
      active: true, kind: "sub", plan: "yearly",
      since: "2026-09-01T00:00:00.000Z", source: "server",
    });
  });

  it("무료 이용권(comp)도 active로 읽는다", () => {
    const p = parsePremiumStatus({ premium: { active: true, kind: "comp", plan: null, since: null } });
    expect(p.active).toBe(true);
    expect(p.kind).toBe("comp");
  });

  it("premium.active가 false면 비활성", () => {
    const p = parsePremiumStatus({ unlimited: false, premium: { active: false, kind: null, plan: null, since: null } });
    expect(p.active).toBe(false);
  });

  it("구서버(premium 필드 없음)는 unlimited로 폴백한다", () => {
    const p = parsePremiumStatus({ unlimited: true, text: { used: 1, max: 10 } });
    expect(p).toEqual({ active: true, kind: null, plan: null, since: null, source: "server" });
  });

  it("구서버 unlimited:false도 폴백으로 비활성 판정", () => {
    expect(parsePremiumStatus({ unlimited: false }).active).toBe(false);
  });

  it("premium도 unlimited도 없는 응답은 null(판정 불가 → 이전 값 유지)", () => {
    expect(parsePremiumStatus({ text: { used: 0 } })).toBeNull();
    expect(parsePremiumStatus(null)).toBeNull();
    expect(parsePremiumStatus("nope")).toBeNull();
  });
});

// 서버는 text/video의 used·max를 같이 주는데 앱이 버려서 남은 횟수를 볼 방법이 없었다(1.11.8)
describe("parseUsage — 남은 횟수 보존", () => {
  it("text·video의 used/max를 읽고 left를 계산한다", () => {
    const u = parseUsage({ text: { allowed: true, used: 3, max: 10 }, video: { allowed: true, used: 2, max: 15 } });
    expect(u.text).toEqual({ used: 3, max: 10, left: 7 });
    expect(u.video).toEqual({ used: 2, max: 15, left: 13 });
  });

  it("한도를 넘겨 써도 left는 음수가 되지 않는다", () => {
    expect(parseUsage({ text: { used: 12, max: 10 } }).text.left).toBe(0);
  });

  it("한쪽만 있으면 나머지는 null", () => {
    const u = parseUsage({ text: { used: 0, max: 1 } });
    expect(u.text.left).toBe(1);
    expect(u.video).toBeNull();
  });

  it("used/max가 없는 구서버 응답은 null (표시 생략)", () => {
    expect(parseUsage({ unlimited: true })).toBeNull();
    expect(parseUsage({ text: { allowed: true } })).toBeNull();
    expect(parseUsage(null)).toBeNull();
  });
});

describe("fetchUsageStatus — 네트워크 실패 시 이전 값 유지용 null", () => {
  afterEach(() => { global.fetch = undefined; });

  it("200 응답이면 프리미엄 판정과 남은 횟수를 한 번에 돌려준다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        premium: { active: true, kind: "sub", plan: "monthly", since: "2026-09-10T00:00:00.000Z" },
        text: { used: 1, max: 10 },
        video: { used: 0, max: 15 },
      }),
    }));
    const { premium, usage } = await fetchUsageStatus();
    expect(premium.active).toBe(true);
    expect(premium.plan).toBe("monthly");
    expect(usage.text).toEqual({ used: 1, max: 10, left: 9 });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://artlink-server.vercel.app/api/usage-status",
      expect.objectContaining({ headers: expect.objectContaining({ "X-App-Token": "t" }) })
    );
  });

  it("non-2xx면 둘 다 null (깜빡임 방지 — 호출부가 이전 값을 유지한다)", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchUsageStatus()).toEqual({ premium: null, usage: null });
  });

  it("네트워크 예외여도 throw하지 않는다", async () => {
    global.fetch = jest.fn(async () => { throw new Error("offline"); });
    expect(await fetchUsageStatus()).toEqual({ premium: null, usage: null });
  });

  it("JSON 파싱 실패여도 둘 다 null", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }));
    expect(await fetchUsageStatus()).toEqual({ premium: null, usage: null });
  });
});

// 결제 정본은 RevenueCat — 서버 웹훅이 익명 결제·유실로 놓쳐도 앱은 프리미엄을 꺼뜨리면 안 된다
describe("mergeRcPremium — 서버 || RevenueCat 판정", () => {
  const serverActive = { active: true, kind: "sub", plan: "yearly", since: "2026-09-01", source: "server" };
  const serverOff = { active: false, kind: null, plan: null, since: null, source: "server" };

  it("서버가 활성이면 서버 값을 그대로 쓴다", () => {
    expect(mergeRcPremium(serverActive, false)).toBe(serverActive);
    expect(mergeRcPremium(serverActive, true)).toBe(serverActive);
  });

  it("서버가 false여도 RevenueCat이 활성이면 프리미엄이다", () => {
    const p = mergeRcPremium(serverOff, true);
    expect(p.active).toBe(true);
    expect(p.kind).toBe("sub");
    // source가 purchase면 한도 안내가 "구독 확인 중" 문구로 갈린다
    expect(p.source).toBe("purchase");
  });

  it("둘 다 false면 비활성", () => {
    expect(mergeRcPremium(serverOff, false).active).toBe(false);
  });

  it("서버 값이 없으면(조회 실패) RevenueCat만으로 판정한다", () => {
    expect(mergeRcPremium(null, true).active).toBe(true);
    expect(mergeRcPremium(null, false)).toBe(EMPTY_PREMIUM);
  });

  it("서버가 준 plan·since는 RevenueCat 보강 뒤에도 남는다", () => {
    const expired = { active: false, kind: "sub", plan: "monthly", since: "2026-01-01", source: "server" };
    const p = mergeRcPremium(expired, true);
    expect(p.plan).toBe("monthly");
    expect(p.since).toBe("2026-01-01");
  });
});

describe("requestPremiumResync — 서버 복구 요청", () => {
  afterEach(() => { global.fetch = undefined; });

  it("서버가 active:true면 true", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, active: true }) }));
    expect(await requestPremiumResync()).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://artlink-server.vercel.app/api/premium-resync",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("미구성(501)·장애(502)·네트워크 예외는 조용히 false — 앱은 RevenueCat 판정을 유지한다", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 501, json: async () => ({ ok: false }) }));
    expect(await requestPremiumResync()).toBe(false);
    global.fetch = jest.fn(async () => { throw new Error("offline"); });
    expect(await requestPremiumResync()).toBe(false);
  });
});

// 실증된 사고: 로그인 확정 전 결제 → RevenueCat 익명 ID → 웹훅이 스킵 → 서버는 계속 false.
// 앱이 스토어 영수증을 한 번도 안 읽어서 실결제자가 무료로 떨어졌다.
describe("syncStorePremium — 스토어 영수증 확인 + 서버 복구", () => {
  beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, active: true }) })); });
  afterEach(() => { global.fetch = undefined; });

  it("RevenueCat이 활성인데 서버가 false면 복구를 요청한다", async () => {
    checkPremium.mockResolvedValueOnce(true);
    expect(await syncStorePremium(false)).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://artlink-server.vercel.app/api/premium-resync",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("서버도 이미 활성이면 복구를 부르지 않는다", async () => {
    checkPremium.mockResolvedValueOnce(true);
    expect(await syncStorePremium(true)).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("RevenueCat도 비활성이면 복구를 부르지 않는다", async () => {
    checkPremium.mockResolvedValueOnce(false);
    expect(await syncStorePremium(false)).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("EMPTY_PREMIUM — 로그아웃·게스트 기본값", () => {
  it("비활성 상태다", () => {
    expect(EMPTY_PREMIUM.active).toBe(false);
    expect(EMPTY_PREMIUM.kind).toBeNull();
  });
});

// 커뮤니티 왕관 — community_posts에 author_premium 컬럼이 없어(PostgREST 400) 글에 못 저장한다.
// 대신 서버가 주는 활성 프리미엄 id 목록으로 그린다. 실패하면 배지를 안 그릴 뿐 오류는 아니다.
const { fetchPremiumUserIds, clearPremiumUserIdsCache } = require("../premiumService");

describe("fetchPremiumUserIds — 활성 프리미엄 id 목록", () => {
  beforeEach(() => clearPremiumUserIdsCache());
  afterEach(() => { global.fetch = undefined; });

  it("200이면 userIds를 Set으로 돌려준다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ userIds: ["a", "b"], count: 2, generatedAt: new Date().toISOString() }),
    }));
    const ids = await fetchPremiumUserIds();
    expect(ids instanceof Set).toBe(true);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("zzz")).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://artlink-server.vercel.app/api/premium-badges",
      expect.objectContaining({ headers: expect.objectContaining({ "X-App-Token": "t" }) })
    );
  });

  it("non-2xx면 null (배지 없음 — 오류 표시 아님)", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchPremiumUserIds()).toBeNull();
  });

  it("네트워크 예외여도 throw하지 않고 null", async () => {
    global.fetch = jest.fn(async () => { throw new Error("offline"); });
    expect(await fetchPremiumUserIds()).toBeNull();
  });

  it("userIds가 배열이 아니면 null", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ count: 0 }) }));
    expect(await fetchPremiumUserIds()).toBeNull();
  });

  it("5분 안에 다시 부르면 캐시를 쓰고 네트워크를 안 탄다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ userIds: ["a"], count: 1, generatedAt: new Date().toISOString() }),
    }));
    await fetchPremiumUserIds();
    const ids = await fetchPremiumUserIds();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(ids.has("a")).toBe(true);
  });

  it("generatedAt이 5분보다 오래됐으면 캐시가 만료돼 다시 받는다", async () => {
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ userIds: ["a"], count: 1, generatedAt: stale }),
    }));
    await fetchPremiumUserIds();
    await fetchPremiumUserIds();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("force면 캐시를 무시하고 다시 받는다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ userIds: ["a"], count: 1, generatedAt: new Date().toISOString() }),
    }));
    await fetchPremiumUserIds();
    await fetchPremiumUserIds({ force: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않는다 — 다음 호출에서 다시 시도한다", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    expect(await fetchPremiumUserIds()).toBeNull();
    expect(await fetchPremiumUserIds()).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("shouldApplyServerPremium — 결제 직후 낙관적 활성 보호", () => {
  const now = 1_000_000;
  it("낙관 구간 안에서 서버가 false면 무시한다", () => {
    expect(shouldApplyServerPremium({ active: false }, now + 1000, now)).toBe(false);
  });
  it("낙관 구간 안이라도 서버가 true면 반영한다", () => {
    expect(shouldApplyServerPremium({ active: true }, now + 1000, now)).toBe(true);
  });
  it("낙관 구간이 지나면 서버 false를 반영한다", () => {
    expect(shouldApplyServerPremium({ active: false }, now - 1, now)).toBe(true);
  });
  it("낙관 구간이 없으면(0) 서버 값을 그대로 반영한다", () => {
    expect(shouldApplyServerPremium({ active: false }, 0, now)).toBe(true);
  });
  it("서버 응답이 null이면 반영하지 않는다", () => {
    expect(shouldApplyServerPremium(null, 0, now)).toBe(false);
  });
  it("낙관 구간은 3분이다", () => {
    expect(PREMIUM_OPTIMISTIC_MS).toBe(180000);
  });
});
