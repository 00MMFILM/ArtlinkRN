// 회원 탈퇴는 서버가 complete:true를 준 경우에만 로컬을 지우고 완료로 처리한다.
// 실패하면 자료도 로그인도 그대로 남아 같은 화면에서 다시 시도할 수 있어야 한다.
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
jest.mock("../../services/profileService", () => ({ upsertArtistProfile: jest.fn(async () => ({ ok: true })), uploadProfilePhotos: jest.fn(), mergeServerStats: jest.fn((a) => a), syncProfileVisibility: jest.fn(async () => ({ ok: true })), nextVisibilityStamp: jest.requireActual("../../services/profileService").nextVisibilityStamp }));
jest.mock("../../services/mauService", () => ({ trackAppOpen: jest.fn(), trackFunnelEvent: jest.fn() }));
jest.mock("../../services/matchingService", () => ({ createMatchingPost: jest.fn(), deleteMatchingPost: jest.fn() }));
jest.mock("../../services/apiConfig", () => ({ SERVER_URL: "https://invalid.test", getApiHeaders: () => ({}), setApiDeviceId: jest.fn(), setDataConsentCache: jest.fn() }));
jest.mock("../../services/premiumService", () => ({ fetchPremiumStatus: jest.fn(async () => ({})), EMPTY_PREMIUM: {}, shouldApplyServerPremium: jest.fn(() => true), PREMIUM_OPTIMISTIC_MS: 1000 }));
jest.mock("../../services/practiceService", () => ({ getPracticeLog: jest.fn(async () => []) }));
jest.mock("../../services/recordingMigration", () => ({ migrateCachedRecordings: jest.fn(async () => null) }));
jest.mock("../../services/accountDeleteService", () => ({ requestAccountDelete: jest.fn() }));
const disk = require("@react-native-async-storage/async-storage");
const { requestAccountDelete } = require("../../services/accountDeleteService");
const { AppProvider, useApp } = require("../AppContext");
let current, tree;
function Probe() { current = useApp(); return null; }
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = create(<AppProvider><Probe /></AppProvider>); await settle(); }); await act(settle); };
beforeEach(async () => {
  await disk.clear(); jest.clearAllMocks();
  mockUser = { id: "A", user_metadata: { name: "A" } };
  await disk.setItem("artlink-profile", JSON.stringify({ name: "A", authUserId: "A" }));
  await disk.setItem("artlink-notes", JSON.stringify([{ id: 1, title: "A only", createdAt: "2026-09-20", updatedAt: "2026-09-20" }]));
  await disk.setItem("artlink-language", JSON.stringify("ko"));
  await disk.setItem("artlink-device-id", JSON.stringify("device_1"));
  await disk.setItem("artlink-eula-accepted", JSON.stringify(true));
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test("서버가 complete:true를 준 경우에만 로컬을 지우고 제외 목록을 돌려준다", async () => {
  requestAccountDelete.mockResolvedValue({ ok: true, complete: true, deleted: { notes: 1 }, excludes: ["소유자 없는 기존 학습 텍스트"] });
  await mount();
  expect(current.savedNotes).toHaveLength(1);
  let result;
  await act(async () => { result = await current.handleDeleteAccount(); await settle(); });
  expect(result.excludes).toEqual(["소유자 없는 기존 학습 텍스트"]);
  expect(await disk.getItem("artlink-note-state-v1::account:A")).toBeNull();
  expect(await disk.getItem("artlink-notes::account:A")).toBeNull();
  expect(current.savedNotes).toEqual([]);
});

test("삭제 실패는 로컬 자료와 로그인 상태를 지우지 않고 재시도로 완료된다", async () => {
  const failure = Object.assign(new Error("ACCOUNT_DELETE_INCOMPLETE"), { failed: ["media_archive"], retryable: true });
  requestAccountDelete.mockRejectedValueOnce(failure);
  await mount();
  await act(async () => {
    await expect(current.handleDeleteAccount()).rejects.toMatchObject({ failed: ["media_archive"] });
    await settle();
  });
  expect(JSON.parse(await disk.getItem("artlink-note-state-v1::account:A")).notes).toHaveLength(1);
  expect(current.userProfile.authUserId).toBe("A");
  expect(current.authState).toBe("app");

  requestAccountDelete.mockResolvedValueOnce({ ok: true, complete: true, deleted: {}, excludes: [] });
  await act(async () => { await current.handleDeleteAccount(); await settle(); });
  expect(await disk.getItem("artlink-note-state-v1::account:A")).toBeNull();
});

test("계정 삭제가 기기 공용 설정(언어·기기 id·EULA 동의)을 날리지 않는다", async () => {
  requestAccountDelete.mockResolvedValue({ ok: true, complete: true, deleted: {}, excludes: [] });
  await mount();
  await act(async () => { await current.handleDeleteAccount(); await settle(); });
  expect(await disk.getItem("artlink-language")).toBe(JSON.stringify("ko"));
  expect(await disk.getItem("artlink-device-id")).toBe(JSON.stringify("device_1"));
  expect(await disk.getItem("artlink-eula-accepted")).toBe(JSON.stringify(true));
  // 이 계정 소유로 확인된 구버전 사본은 남기지 않는다
  expect(await disk.getItem("artlink-notes")).toBeNull();
});

test("로그인하지 않았으면 삭제를 시도하지 않는다", async () => {
  await disk.clear(); mockUser = null;
  await mount();
  await act(async () => { await current.handleAuth(null); await settle(); });
  await expect(current.handleDeleteAccount()).rejects.toThrow("ACCOUNT_DELETION_REQUIRES_LOGIN");
  expect(requestAccountDelete).not.toHaveBeenCalled();
});
