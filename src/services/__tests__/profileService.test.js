// supabase 클라이언트/AsyncStorage 기반 유틸은 mergeServerStats 테스트에서 쓰지 않으므로 mock (네이티브 모듈 의존 제거)
jest.mock("../supabaseClient", () => ({ supabase: {}, getAuthToken: () => null }));
jest.mock("../../utils/storage", () => ({
  safeStorageGet: async () => null,
  safeStorageSet: async () => {},
  STORAGE_KEYS: {},
}));

import { mergeServerStats, nextVisibilityStamp, upsertArtistProfile, syncProfileVisibility } from "../profileService";

describe("mergeServerStats — 앱 표시값과 B2B 대시보드 값 불일치 방지", () => {
  const local = {
    overallScore: 60,
    mileage: 500,
    level: 3,
    radarValues: [1, 2, 3, 4, 5, 6],
    streak: 7,
    topTags: [["연기", 5]],
  };

  it("서버 score가 있으면 그 값으로 덮어써 표시한다", () => {
    const merged = mergeServerStats(local, { score: 83, mileage: 1333, level: 6 });
    expect(merged.overallScore).toBe(83);
    expect(merged.mileage).toBe(1333);
    expect(merged.level).toBe(6);
  });

  it("서버 mileage/level이 undefined면 로컬 값을 유지한다", () => {
    const merged = mergeServerStats(local, { score: 83, mileage: undefined, level: undefined });
    expect(merged.overallScore).toBe(83);
    expect(merged.mileage).toBe(500);
    expect(merged.level).toBe(3);
  });

  it("서버 응답이 null이면 로컬 값을 그대로 반환한다", () => {
    const merged = mergeServerStats(local, null);
    expect(merged).toBe(local);
  });

  it("서버 응답이 undefined여도 로컬 값을 그대로 반환한다", () => {
    const merged = mergeServerStats(local, undefined);
    expect(merged).toBe(local);
  });

  it("radarValues·streak·topTags 등 나머지 필드는 절대 변형하지 않는다", () => {
    const merged = mergeServerStats(local, { score: 83, mileage: 1333, level: 6 });
    expect(merged.radarValues).toBe(local.radarValues);
    expect(merged.streak).toBe(local.streak);
    expect(merged.topTags).toBe(local.topTags);
  });

  it("local이 null/undefined면 그대로 반환한다 (초기 로딩 방어)", () => {
    expect(mergeServerStats(null, { score: 1 })).toBeNull();
    expect(mergeServerStats(undefined, { score: 1 })).toBeUndefined();
  });
});

describe("공개 여부 — 단조 증가 타임스탬프와 서버 반영", () => {
  beforeEach(() => { global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })); });

  it("이전 값이 더 미래여도 항상 더 큰 값을 만든다", () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(Date.parse(nextVisibilityStamp(future))).toBeGreaterThan(Date.parse(future));
    expect(Date.parse(nextVisibilityStamp(null))).toBeGreaterThan(0);
  });

  it("토글한 적 없는 프로필은 공개 여부를 주장하지 않는다", async () => {
    await upsertArtistProfile("u1", { name: "차서원", profilePublic: true });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("visibilityUpdatedAt");
    expect(body).not.toHaveProperty("profilePublic");
  });

  it("일반 프로필 업로드에도 profilePublic과 visibilityUpdatedAt이 실린다", async () => {
    await upsertArtistProfile("u1", { name: "차서원", profilePublic: true, visibilityUpdatedAt: "2026-09-23T00:00:00.000Z" });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.profilePublic).toBe(true);
    expect(body.visibilityUpdatedAt).toBe("2026-09-23T00:00:00.000Z");
  });

  it("공개 OFF만 따로 보낼 수 있고 ok가 아니면 실패로 올린다", async () => {
    await syncProfileVisibility("u1", { profilePublic: false, visibilityUpdatedAt: "2026-09-23T01:00:00.000Z" });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.profilePublic).toBe(false);
    expect(body.profile._visibilityOnly).toBe(true);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    await expect(syncProfileVisibility("u1", { profilePublic: false, visibilityUpdatedAt: "2026-09-23T01:00:00.000Z" }))
      .rejects.toThrow("visibility sync failed");
  });
});

// 다른 기기에서 공개를 껐는데 이 기기가 그 사실을 모른 채 다시 켜는 것을 막는다.
describe("adoptServerVisibility — 서버가 알려준 공개 상태 따르기", () => {
  const { adoptServerVisibility } = require("../profileService");

  it("서버 값이 더 새로우면 그 값을 따른다", () => {
    const local = { profilePublic: true, visibilityUpdatedAt: "2026-09-20T00:00:00.000Z" };
    const res = adoptServerVisibility(local, { profilePublic: false, visibilityUpdatedAt: "2026-09-22T00:00:00.000Z" });
    expect(res).toEqual({ profilePublic: false, visibilityUpdatedAt: "2026-09-22T00:00:00.000Z" });
  });

  it("내 설정이 더 새로우면 서버 값을 따르지 않는다", () => {
    const local = { profilePublic: false, visibilityUpdatedAt: "2026-09-23T00:00:00.000Z" };
    expect(adoptServerVisibility(local, { profilePublic: true, visibilityUpdatedAt: "2026-09-21T00:00:00.000Z" })).toBeNull();
  });

  it("같은 상태면 아무것도 바꾸지 않는다", () => {
    const local = { profilePublic: false, visibilityUpdatedAt: "2026-09-22T00:00:00.000Z" };
    expect(adoptServerVisibility(local, { profilePublic: false, visibilityUpdatedAt: "2026-09-22T00:00:00.000Z" })).toBeNull();
  });

  it("서버가 공개 상태를 알려주지 않으면 그대로 둔다", () => {
    expect(adoptServerVisibility({ profilePublic: true }, { ok: true })).toBeNull();
  });

  it("이 기기가 한 번도 설정한 적 없으면 서버 값을 받아들인다", () => {
    expect(adoptServerVisibility({ profilePublic: true }, { profilePublic: false, visibilityUpdatedAt: "2026-09-22T00:00:00.000Z" }))
      .toEqual({ profilePublic: false, visibilityUpdatedAt: "2026-09-22T00:00:00.000Z" });
  });
});
