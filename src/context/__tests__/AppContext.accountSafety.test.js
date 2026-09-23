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
jest.mock("../../services/profileService", () => ({ upsertArtistProfile: jest.fn(async () => ({ ok: true })), uploadProfilePhotos: jest.fn(), mergeServerStats: jest.fn((a) => a) }));
jest.mock("../../services/mauService", () => ({ trackAppOpen: jest.fn(), trackFunnelEvent: jest.fn() }));
jest.mock("../../services/matchingService", () => ({ createMatchingPost: jest.fn(), deleteMatchingPost: jest.fn() }));
jest.mock("../../services/apiConfig", () => ({ SERVER_URL: "https://invalid.test", getApiHeaders: () => ({}), setApiDeviceId: jest.fn(), setDataConsentCache: jest.fn() }));
jest.mock("../../services/premiumService", () => ({ fetchPremiumStatus: jest.fn(async () => ({})), EMPTY_PREMIUM: {}, shouldApplyServerPremium: jest.fn(() => true), PREMIUM_OPTIMISTIC_MS: 1000 }));
jest.mock("../../services/practiceService", () => ({ getPracticeLog: jest.fn(async () => []) }));
jest.mock("../../services/recordingMigration", () => ({ migrateCachedRecordings: jest.fn(async () => null) }));
const disk = require("@react-native-async-storage/async-storage");
const { AppProvider, useApp } = require("../AppContext");
const { readNoteState } = require("../../services/noteStore");
let current, tree;
function Probe() { current = useApp(); return null; }
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const mount = async () => { await act(async () => { tree = create(<AppProvider><Probe /></AppProvider>); await settle(); }); await act(settle); };
beforeEach(async () => {
  await disk.clear(); mockUser = { id: "A", user_metadata: { name: "A" } };
  await disk.setItem("artlink-profile", JSON.stringify({ name: "A", authUserId: "A" }));
  await disk.setItem("artlink-notes", JSON.stringify([{ id: 1, title: "A only", content: "A private", createdAt: "2026-09-20", updatedAt: "2026-09-20" }]));
  await disk.setItem("artlink-portfolio-items", JSON.stringify([{ id: 2, uri: "file://A-photo" }]));
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test("A → 로그아웃 → B 로그인은 A 노트·포트폴리오를 B 화면/백업으로 옮기지 않는다", async () => {
  await mount();
  expect(current.savedNotes[0].title).toBe("A only");
  await act(async () => { await current.handleLogout(); await settle(); });
  expect(current.savedNotes).toEqual([]);
  expect(current.portfolioItems).toEqual([]);
  mockUser = { id: "B", user_metadata: { name: "B" } };
  await act(async () => { await current.handleAuth({ email: "b@example.test", _mergeExisting: true }); await settle(); });
  await act(settle);
  expect(current.userProfile.authUserId).toBe("B");
  expect(current.savedNotes).toEqual([]);
  expect((await readNoteState("account:B")).notes).toEqual([]);
  expect((await readNoteState("account:A")).notes[0].title).toBe("A only");
});

test("신규 guest 노트는 가입한 계정으로 이관된다", async () => {
  await disk.clear(); mockUser = null;
  await mount();
  await act(async () => { await current.handleAuth(null); await settle(); });
  await act(async () => { await current.handleSaveNote({ title: "guest work", content: "guest" }); await settle(); });
  mockUser = { id: "new-member", user_metadata: { name: "member" } };
  await act(async () => { await current.handleAuth({ name: "member" }); await settle(); });
  await act(settle);
  expect(current.savedNotes.map((n) => n.title)).toEqual(["guest work"]);
  expect((await readNoteState("account:new-member")).notes[0].title).toBe("guest work");
});

test("저장 실패는 성공토스트/화면기록을 만들지 않고 재시도할 수 있다", async () => {
  await mount(); await act(settle);
  const oldCount = current.savedNotes.length;
  const oldToast = current.toast;
  disk.setItem.mockRejectedValueOnce(new Error("disk full"));
  await act(async () => {
    await expect(current.handleSaveNote({ title: "unsaved", content: "not persisted" })).rejects.toThrow("disk full");
  });
  expect(current.savedNotes).toHaveLength(oldCount);
  expect(current.toast).toBe(oldToast);
  await act(async () => { await current.handleSaveNote({ title: "saved on retry", content: "ok" }); await settle(); });
  expect(current.savedNotes.some((n) => n.title === "saved on retry")).toBe(true);
});

test("A 화면에서 잡은 늦은 저장 콜백은 B 계정에 쓰지 않는다", async () => {
  await mount();
  const oldSave = current.handleSaveNote;
  await act(async () => { await current.handleLogout(); await settle(); });
  mockUser = { id: "B", user_metadata: { name: "B" } };
  await act(async () => { await current.handleAuth({ name: "B" }); await settle(); });
  await expect(oldSave({ title: "late A", content: "private" })).rejects.toThrow("ACCOUNT_NOT_READY");
  expect((await readNoteState("account:B")).notes).toEqual([]);
});

test("개인자료 read 실패를 빈 계정으로 저장하지 않고 다음 로그인에서 재시도한다", async () => {
  await mount();
  await act(async () => { await current.handleLogout(); await settle(); });
  const originalGet = disk.getItem.getMockImplementation();
  disk.getItem.mockImplementation(async (key) => {
    if (key === "artlink-portfolio-items::account:A") throw new Error("read failed");
    return originalGet(key);
  });
  mockUser = { id: "A", user_metadata: { name: "A" } };
  await act(async () => {
    await expect(current.handleAuth({ name: "A" })).rejects.toThrow("read failed");
  });
  expect(current.storageReady).toBe(false);
  disk.getItem.mockImplementation(originalGet);
  const persisted = JSON.parse(await disk.getItem("artlink-portfolio-items::account:A"));
  expect(persisted).toEqual([{ id: 2, uri: "file://A-photo" }]);
  await act(async () => { await current.handleAuth({ name: "A" }); await settle(); });
  expect(current.portfolioItems).toEqual(persisted);
});

test("늦은 초기 session 조회는 사용자가 선택한 B scope를 되돌리지 않는다", async () => {
  const { supabase } = require("../../services/supabaseClient");
  let resolveSession;
  supabase.auth.getSession.mockImplementationOnce(() => new Promise((resolve) => { resolveSession = resolve; }));
  await mount();
  mockUser = { id: "B", user_metadata: { name: "B" } };
  await act(async () => { await current.handleAuth({ name: "B" }); await settle(); });
  await act(async () => { resolveSession({ data: { session: { user: { id: "A" } } } }); await settle(); });
  expect(current.userProfile.authUserId).toBe("B");
  expect(current.savedNotes).toEqual([]);
  expect(require("../../utils/accountStorage").getStorageScope()).toBe("account:B");
});

test("A의 늦은 AI 소개문 결과가 B 포트폴리오에 저장되지 않는다", async () => {
  await mount();
  const oldSummary = current.handleUpdatePortfolioSummary;
  await act(async () => { await current.handleLogout(); await settle(); });
  mockUser = { id: "B", user_metadata: { name: "B" } };
  await act(async () => { await current.handleAuth({ name: "B" }); await settle(); });
  expect(() => oldSummary({ summaryText: "A private biography" })).toThrow("ACCOUNT_CHANGED");
  expect(current.portfolioSummary).toBeNull();
  expect(await disk.getItem("artlink-portfolio-summary::account:B")).toBeNull();
});
