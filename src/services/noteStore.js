import { rawStorageForScope, strictSetItem, scopedKey, getStorageScope, withStorageLock } from "../utils/accountStorage";

export const NOTE_STATE_KEY = "artlink-note-state-v1";

export async function readNoteState(scope = getStorageScope()) {
  const storage = rawStorageForScope(scope);
  const raw = await storage.getItem(NOTE_STATE_KEY);
  if (raw !== null) {
    const value = JSON.parse(raw);
    if (!Array.isArray(value.notes) || !value.tombstones || typeof value.tombstones !== "object") throw new Error("INVALID_NOTE_STORE");
    return value;
  }
  const legacy = await storage.getItem("artlink-notes");
  const notes = legacy ? JSON.parse(legacy) : [];
  if (!Array.isArray(notes)) throw new Error("INVALID_NOTE_STORE");
  return { notes, tombstones: {} };
}

// Notes and deletion intent are a single durable write. Rejected writes never
// change the in-memory UI or remove the draft. Concurrent saves are serialized.
export function mutateNoteState(scope, mutation) {
  return withStorageLock(NOTE_STATE_KEY, scope, async () => {
    const current = await readNoteState(scope);
    const next = mutation(current);
    await strictSetItem(scopedKey(NOTE_STATE_KEY, scope), JSON.stringify(next));
    return next;
  });
}
