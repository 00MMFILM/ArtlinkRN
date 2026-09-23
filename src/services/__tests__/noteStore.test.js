jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
const disk = require("@react-native-async-storage/async-storage");
const { readNoteState, mutateNoteState } = require("../noteStore");
const { setStorageScope } = require("../../utils/accountStorage");
beforeEach(async () => { await disk.clear(); await setStorageScope("account:A"); jest.clearAllMocks(); });

test("저장 실패는 reject하며 이전 기록과 삭제 이력을 유지한다", async () => {
  await mutateNoteState("account:A", () => ({ notes: [{ id: 1 }], tombstones: {} }));
  disk.setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(mutateNoteState("account:A", () => ({ notes: [], tombstones: { 1: { synced: false } } }))).rejects.toThrow("disk full");
  expect(await readNoteState("account:A")).toEqual({ notes: [{ id: 1 }], tombstones: {} });
});

test("동시 저장/삭제는 순서대로 commit하여 새 기록을 덮어쓰지 않는다", async () => {
  await Promise.all([
    mutateNoteState("account:A", (s) => ({ ...s, notes: [...s.notes, { id: 1 }] })),
    mutateNoteState("account:A", (s) => ({ ...s, notes: [...s.notes, { id: 2 }] })),
    mutateNoteState("account:A", (s) => ({ notes: s.notes.filter((n) => n.id !== 1), tombstones: { 1: { synced: false } } })),
  ]);
  expect(await readNoteState("account:A")).toEqual({ notes: [{ id: 2 }], tombstones: { 1: { synced: false } } });
});
