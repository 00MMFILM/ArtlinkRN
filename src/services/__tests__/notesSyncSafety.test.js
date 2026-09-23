jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn() } }));
const disk = require("@react-native-async-storage/async-storage");
const { supabase } = require("../supabaseClient");
const { setStorageScope } = require("../../utils/accountStorage");
const { readNoteState, mutateNoteState } = require("../noteStore");
const { syncAccountNotes, syncNotesToServer, mergeNotes } = require("../notesSyncService");
let rows, upsert, selectPromise;
beforeEach(async () => {
  await disk.clear(); await setStorageScope("account:A");
  rows = []; selectPromise = null; upsert = jest.fn(async () => ({ error: null }));
  supabase.from.mockImplementation(() => ({
    upsert,
    select: () => ({ eq: () => ({ order: () => selectPromise || Promise.resolve({ data: rows, error: null }) }) }),
  }));
});

test("타기기 삭제 tombstone은 오래된 로컬 노트를 없애고 재업로드하지 않는다", async () => {
  await mutateNoteState("account:A", () => ({ notes: [{ id: 1, title: "old" }], tombstones: {} }));
  rows = [{ local_id: 1, deleted: true, updated_at: "2026-09-23" }];
  const onChange = jest.fn();
  await syncAccountNotes({ authUserId: "A", scope: "account:A", onChange });
  expect((await readNoteState("account:A")).notes).toEqual([]);
  expect(upsert).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith([]);
});

test("오프라인 삭제는 실패 후 남고 다음 sync에서 재전송된다", async () => {
  await mutateNoteState("account:A", () => ({ notes: [], tombstones: { 1: { deletedAt: "2026-09-23", synced: false } } }));
  rows = [{ local_id: 1, deleted: false, title: "old" }];
  upsert.mockResolvedValueOnce({ error: new Error("offline") });
  await expect(syncAccountNotes({ authUserId: "A", scope: "account:A" })).rejects.toThrow("offline");
  expect((await readNoteState("account:A")).tombstones[1].synced).toBe(false);
  await syncAccountNotes({ authUserId: "A", scope: "account:A" });
  expect((await readNoteState("account:A")).notes).toEqual([]);
  expect((await readNoteState("account:A")).tombstones[1].synced).toBe(true);
  expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ local_id: "1", deleted: true }), expect.any(Object));
});

test("A fetch가 B 전환 뒤 도착하면 화면과 B 저장소를 건드리지 않는다", async () => {
  let resolveFetch;
  selectPromise = new Promise((resolve) => { resolveFetch = resolve; });
  let current = true;
  const onChange = jest.fn();
  const work = syncAccountNotes({ authUserId: "A", scope: "account:A", isCurrent: () => current, onChange });
  await Promise.resolve(); await Promise.resolve();
  current = false; await setStorageScope("account:B");
  resolveFetch({ data: [{ local_id: 1, content: "A private" }], error: null });
  await work;
  expect(onChange).not.toHaveBeenCalled();
  expect((await readNoteState("account:B")).notes).toEqual([]);
  expect(upsert).not.toHaveBeenCalled();
});

test("practice_meta만 미적용이면 기존 노트 저장으로 폴백한다", async () => {
  upsert.mockResolvedValueOnce({ error: { code: "PGRST204", message: "Could not find practice_meta column" } });
  await syncNotesToServer("A", [{ id: 1, sceneId: "scene", rootNoteId: 10 }]);
  expect(upsert.mock.calls[0][0][0].practice_meta).toEqual({ sceneId: "scene", rootNoteId: 10 });
  expect(upsert.mock.calls[1][0][0]).not.toHaveProperty("practice_meta");
  upsert.mockClear(); upsert.mockResolvedValueOnce({ error: { code: "42501", message: "practice_meta permission denied" } });
  await expect(syncNotesToServer("A", [{ id: 1 }])).rejects.toMatchObject({ code: "42501" });
  expect(upsert).toHaveBeenCalledTimes(1);
});

test("다른 기기 복원은 재연습 연결을 가져오고 구서버 응답은 로컬 연결을 지우지 않는다", () => {
  const row = { local_id: 1, updated_at: "2026-09-23", practice_meta: { sceneId: "scene", parentNoteId: 99, practiceSessionId: "session" } };
  expect(mergeNotes([], [row])[0]).toMatchObject({ sceneId: "scene", parentNoteId: 99, practiceSessionId: "session" });
  expect(mergeNotes([{ id: 1, updatedAt: "2026-09-22", sceneId: "local" }], [{ ...row, practice_meta: null }])[0].sceneId).toBe("local");
});
