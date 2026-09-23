// 프로필 공개 OFF는 업로드를 멈추는 것으로 끝나면 안 된다. 서버에 즉시 알리고,
// 확인 전까지 적용됐다고 단정하지 않으며, 늦게 도착한 업로드가 되돌리지 못하게 한다.
import React from "react";
import { act, create } from "react-test-renderer";
jest.mock("react-native", () => ({ AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) }, Platform: { OS: "ios" } }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
let mockAuthListener, mockUser = { id: "A", user_metadata: { name: "A" } };
jest.mock("../../services/supabaseClient", () => ({ supabase: {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: mockUser ? { user: mockUser } : null } })),
    getUser: jest.fn(async () => ({ data: { user: mockUser } })),
    onAuthStateChange: jest.fn((fn) => { mockAuthListener = fn; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
    signOut: jest.fn(async () => { mockUser = null; mockAuthListener("SIGNED_OUT"); return { error: null }; }),
    updateUser: jest.fn(async () => ({})),
  },
  from: jest.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }), upsert: jest.fn(async () => ({ error: null })) })),
} }));
jest.mock("i18next", () => ({ language: "ko", t: (k) => k }));
jest.mock("../../services/analyticsService", () => ({ computeArtistProfile: jest.fn(() => ({})) }));
jest.mock("../../services/communityService", () => ({ ensureDeviceUser: jest.fn(async () => ({ userId: "community-id", profileToken: "fake" })) }));
jest.mock("../../services/profileService", () => ({
  upsertArtistProfile: jest.fn(async () => ({ ok: true })),
  uploadProfilePhotos: jest.fn(),
  mergeServerStats: jest.fn((a) => a),
  syncProfileVisibility: jest.fn(async () => ({ ok: true })),
  adoptServerVisibility: jest.requireActual("../../services/profileService").adoptServerVisibility,
  nextVisibilityStamp: jest.requireActual("../../services/profileService").nextVisibilityStamp,
}));
jest.mock("../../services/mauService", () => ({ trackAppOpen: jest.fn(), trackFunnelEvent: jest.fn() }));
jest.mock("../../services/matchingService", () => ({ createMatchingPost: jest.fn(), deleteMatchingPost: jest.fn() }));
jest.mock("../../services/apiConfig", () => ({ SERVER_URL: "https://invalid.test", getApiHeaders: () => ({}), setApiDeviceId: jest.fn(), setDataConsentCache: jest.fn() }));
jest.mock("../../services/premiumService", () => ({ fetchPremiumStatus: jest.fn(async () => ({})), EMPTY_PREMIUM: {}, shouldApplyServerPremium: jest.fn(() => true), PREMIUM_OPTIMISTIC_MS: 1000 }));
jest.mock("../../services/practiceService", () => ({ getPracticeLog: jest.fn(async () => []) }));
jest.mock("../../services/recordingMigration", () => ({ migrateCachedRecordings: jest.fn(async () => null) }));
jest.mock("../../services/accountDeleteService", () => ({ requestAccountDelete: jest.fn() }));
const disk = require("@react-native-async-storage/async-storage");
const { syncProfileVisibility, upsertArtistProfile } = require("../../services/profileService");
const { AppProvider, useApp } = require("../AppContext");
let current, tree;
function Probe() { current = useApp(); return null; }
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = create(<AppProvider><Probe /></AppProvider>); await settle(); }); await act(settle); };
const unmount = async () => { if (tree) await act(async () => tree.unmount()); tree = null; };
beforeEach(async () => {
  await disk.clear(); jest.clearAllMocks();
  mockUser = { id: "A", user_metadata: { name: "A" } };
  await disk.setItem("artlink-profile", JSON.stringify({ name: "A", authUserId: "A", profilePublic: true }));
});
afterEach(unmount);

test("공개를 끄면 즉시 서버에 OFF를 보내고 확인 전까지 적용 완료로 표시하지 않는다", async () => {
  syncProfileVisibility.mockRejectedValue(new Error("offline"));
  await mount();
  await act(async () => { await current.handleUpdateProfile({ profilePublic: false }); await settle(); });
  expect(syncProfileVisibility).toHaveBeenCalledWith("community-id", expect.objectContaining({
    profilePublic: false, visibilityUpdatedAt: expect.any(String),
  }));
  expect(current.userProfile.visibilityPending).toBe(true);
  expect(JSON.parse(await disk.getItem("artlink-profile::account:A")).visibilityPending).toBe(true);
});

test("서버 반영 실패는 다음 앱 실행에서 다시 보내고 성공하면 대기 표시가 사라진다", async () => {
  syncProfileVisibility.mockRejectedValue(new Error("offline"));
  await mount();
  await act(async () => { await current.handleUpdateProfile({ profilePublic: false }); await settle(); });
  await unmount();

  syncProfileVisibility.mockClear();
  syncProfileVisibility.mockResolvedValue({ ok: true });
  await mount();
  await act(settle);
  expect(syncProfileVisibility).toHaveBeenCalledWith("community-id", expect.objectContaining({ profilePublic: false }));
  expect(current.userProfile.visibilityPending).toBe(false);
  expect(JSON.parse(await disk.getItem("artlink-profile::account:A")).visibilityPending).toBe(false);
});

test("토글할 때마다 visibilityUpdatedAt이 커지고 모든 프로필 업로드에 실린다", async () => {
  syncProfileVisibility.mockResolvedValue({ ok: true });
  await mount();
  await act(async () => { await current.handleUpdateProfile({ profilePublic: false }); await settle(); });
  const first = current.userProfile.visibilityUpdatedAt;
  await act(async () => { await current.handleUpdateProfile({ profilePublic: true }); await settle(); });
  const second = current.userProfile.visibilityUpdatedAt;
  expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
  // 공개 상태의 일반 프로필 업로드에도 같은 값이 실린다
  expect(upsertArtistProfile).toHaveBeenLastCalledWith("community-id", expect.objectContaining({
    profilePublic: true, visibilityUpdatedAt: second,
  }));
});

test("공개 OFF 상태로는 프로필을 서버에 다시 올리지 않는다", async () => {
  syncProfileVisibility.mockResolvedValue({ ok: true });
  await mount();
  upsertArtistProfile.mockClear();
  await act(async () => { await current.handleUpdateProfile({ profilePublic: false }); await settle(); });
  await act(async () => { await current.handleUpdateProfile({ bio: "새 소개" }); await settle(); });
  expect(upsertArtistProfile).not.toHaveBeenCalled();
});

// 다른 기기에서 공개를 껐는데 이 기기가 그 사실을 모르는 경우.
// 서버가 응답에 현재 공개 상태를 실어 주면 이 기기도 따라가야 한다(다시 공개로 되돌리면 안 된다).
test("다른 기기에서 끈 비공개를 서버 응답으로 받아 이 기기도 따라간다", async () => {
  upsertArtistProfile.mockResolvedValue({
    ok: true,
    profilePublic: false,
    visibilityUpdatedAt: "2099-01-01T00:00:00.000Z",
  });
  await mount();
  await act(settle);

  expect(current.userProfile.profilePublic).toBe(false);
  expect(current.userProfile.visibilityUpdatedAt).toBe("2099-01-01T00:00:00.000Z");
  const saved = JSON.parse(await disk.getItem("artlink-profile::account:A"));
  expect(saved.profilePublic).toBe(false);
});
