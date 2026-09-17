// 실구독자 2명이 결제했는데 앱이 "결제 전과 똑같다" — 앱이 프리미엄 여부를 아예 안 읽던 버그(2026-09-17).
// 서버 usage-status의 premium 계약을 앱이 제대로 해석하는지, 구서버/실패에서도 안 깨지는지 검사.
jest.mock("../supabaseClient", () => ({ supabase: {}, getAuthToken: () => null }));
jest.mock("../apiConfig", () => ({
  SERVER_URL: "https://artlink-server.vercel.app",
  getApiHeaders: () => ({ "Content-Type": "application/json", "X-App-Token": "t" }),
}));

const { parsePremiumStatus, fetchPremiumStatus, EMPTY_PREMIUM, shouldApplyServerPremium, PREMIUM_OPTIMISTIC_MS } = require("../premiumService");

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

describe("fetchPremiumStatus — 네트워크 실패 시 이전 값 유지용 null", () => {
  afterEach(() => { global.fetch = undefined; });

  it("200 응답이면 파싱 결과를 돌려준다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ premium: { active: true, kind: "sub", plan: "monthly", since: "2026-09-10T00:00:00.000Z" } }),
    }));
    const p = await fetchPremiumStatus();
    expect(p.active).toBe(true);
    expect(p.plan).toBe("monthly");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://artlink-server.vercel.app/api/usage-status",
      expect.objectContaining({ headers: expect.objectContaining({ "X-App-Token": "t" }) })
    );
  });

  it("non-2xx면 null (깜빡임 방지 — 호출부가 이전 값을 유지한다)", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchPremiumStatus()).toBeNull();
  });

  it("네트워크 예외여도 throw하지 않고 null", async () => {
    global.fetch = jest.fn(async () => { throw new Error("offline"); });
    expect(await fetchPremiumStatus()).toBeNull();
  });

  it("JSON 파싱 실패여도 null", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }));
    expect(await fetchPremiumStatus()).toBeNull();
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
