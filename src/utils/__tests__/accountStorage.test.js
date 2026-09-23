jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
const disk = require("@react-native-async-storage/async-storage");
const { initializeAccountStorage, setStorageScope, getStorageScope, accountScope, rawStorageForScope, transferGuestData, guestStorageScope, scopedKey } = require("../accountStorage");
const put = (key, value) => disk.setItem(key, JSON.stringify(value));
beforeEach(async () => { await disk.clear(); jest.clearAllMocks(); });

test("legacy A 자료는 A에만 복사하고 원본을 보존한다", async () => {
  await put("artlink-profile", { authUserId: "A", name: "A" });
  await put("artlink-notes", [{ id: 1, title: "A note" }]);
  expect(await initializeAccountStorage()).toBe(accountScope("A"));
  expect(JSON.parse(await rawStorageForScope().getItem("artlink-notes"))).toHaveLength(1);
  await setStorageScope(accountScope("B"));
  expect(await rawStorageForScope().getItem("artlink-notes")).toBeNull();
  expect(JSON.parse(await rawStorageForScope(accountScope("A")).getItem("artlink-notes"))).toHaveLength(1);
  expect(JSON.parse(await disk.getItem("artlink-notes"))).toHaveLength(1);
});

test("로그아웃된 구버전의 소유자 불명 자료를 guest/B에 자동 귀속시키지 않는다", async () => {
  await put("artlink-notes", [{ id: 1 }]);
  expect(await initializeAccountStorage()).toBe("guest");
  expect(await rawStorageForScope().getItem("artlink-notes")).toBeNull();
  expect(JSON.parse(await rawStorageForScope("legacy-unassigned").getItem("artlink-notes"))).toHaveLength(1);
});

test("guest → A는 이관하고 다음 guest/B에는 재이관하지 않는다", async () => {
  await setStorageScope("guest");
  await rawStorageForScope().setItem("artlink-notes", JSON.stringify([{ id: 1 }]));
  await rawStorageForScope(accountScope("A")).setItem("artlink-notes", JSON.stringify([{ id: 2 }]));
  await transferGuestData("guest", accountScope("A"));
  const state = JSON.parse(await rawStorageForScope(accountScope("A")).getItem("artlink-note-state-v1"));
  expect(state.notes.map((n) => n.id).sort()).toEqual([1, 2]);
  const freshGuest = await guestStorageScope();
  expect(freshGuest).not.toBe("guest");
  await transferGuestData(freshGuest, accountScope("B"));
  expect(JSON.parse(await rawStorageForScope(accountScope("B")).getItem("artlink-note-state-v1")).notes).toEqual([]);
  await transferGuestData(accountScope("A"), accountScope("B"));
  expect(JSON.parse(await rawStorageForScope(accountScope("B")).getItem("artlink-note-state-v1")).notes).toEqual([]);
});

test("비동기 쓰기는 시작 때 묶은 scope를 유지한다", async () => {
  await setStorageScope(accountScope("A"));
  const owner = rawStorageForScope();
  await setStorageScope(accountScope("B"));
  await owner.setItem("artlink-note-draft", "A draft");
  expect(await rawStorageForScope().getItem("artlink-note-draft")).toBeNull();
  expect(await disk.getItem(scopedKey("artlink-note-draft", accountScope("A")))).toBe("A draft");
});

test("A 로그아웃 후 둘러보기 이력은 legacy 자료의 guest 소유권 증거가 아니다", async () => {
  await put("artlink-profile", null);
  await put("artlink-notes", [{ id: 77, title: "possibly A" }]);
  await disk.setItem("artlink-guest-entered", "true");
  await initializeAccountStorage();
  await transferGuestData("guest", accountScope("B"));
  expect(JSON.parse(await rawStorageForScope(accountScope("B")).getItem("artlink-note-state-v1")).notes).toEqual([]);
  expect(JSON.parse(await rawStorageForScope("legacy-unassigned").getItem("artlink-notes"))[0].id).toBe(77);
});

test("동시에 두 계정이 로그인해도 guest 자료는 먼저 claim한 계정만 가져간다", async () => {
  await setStorageScope("guest");
  await rawStorageForScope().setItem("artlink-notes", JSON.stringify([{ id: 1 }]));
  const results = await Promise.all([transferGuestData("guest", accountScope("A")), transferGuestData("guest", accountScope("B"))]);
  expect(results).toEqual([true, false]);
  expect(await rawStorageForScope(accountScope("B")).getItem("artlink-note-state-v1")).toBeNull();
  expect(await transferGuestData("guest", accountScope("A"))).toBe(true);
});
