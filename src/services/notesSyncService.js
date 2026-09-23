import { supabase } from "./supabaseClient";
import { mutateNoteState, readNoteState } from "./noteStore";

const PRACTICE_FIELDS = ["sceneId", "parentNoteId", "rootNoteId", "focus", "chosenFocus", "focusOptions", "practiceSessionId", "type"];
function practiceMeta(note) {
  const meta = {};
  for (const key of PRACTICE_FIELDS) {
    const value = note?.[key];
    if (key === "focusOptions") {
      if (Array.isArray(value)) meta[key] = value.filter((v) => typeof v === "string").slice(0, 3);
    } else if (typeof value === "string" || typeof value === "number") meta[key] = value;
  }
  return meta;
}
export function isMissingPracticeMetaColumn(error) {
  return ["PGRST204", "42703"].includes(error?.code) && /\bpractice_meta\b/.test(error?.message || "");
}
function noteToRow(authUserId, n) {
  return {
    auth_user_id: authUserId, local_id: n.id,
    title: n.title || "", content: n.content || "", field: n.field || null,
    tags: n.tags || [], series_name: n.seriesName || null, starred: !!n.starred,
    ai_comment: n.aiComment || null, ai_scores: n.aiScores || null,
    video_analysis: n.videoAnalysis || null, ai_model: n.aiModel || null,
    prompt_version: n.promptVersion || null, transcript: n.transcript || null,
    created_at: n.createdAt, updated_at: n.updatedAt || n.createdAt,
    practice_meta: practiceMeta(n), deleted: false,
  };
}

const sameInstant = (a, b) => {
  const left = Date.parse(a), right = Date.parse(b);
  return Number.isNaN(left) || Number.isNaN(right) ? String(a) === String(b) : left === right;
};

// The database keeps a deleted row deleted by returning OLD from a BEFORE UPDATE
// trigger, so an upsert onto a tombstone answers HTTP 200 with the old row and
// stores nothing. Compare what came back with what we sent before calling it saved.
export function classifyUpsertResult(sentRows, savedRows) {
  const outcome = { tombstoned: [], unconfirmed: [] };
  if (!Array.isArray(savedRows)) return outcome; // 반환 행이 없는 서버/클라이언트는 판정하지 않는다
  const byId = new Map(savedRows.map((row) => [String(row.local_id), row]));
  for (const sent of sentRows) {
    const saved = byId.get(String(sent.local_id));
    if (saved?.deleted === true) outcome.tombstoned.push({ id: sent.local_id, deletedAt: saved.updated_at || sent.updated_at });
    else if (!saved || saved.title !== sent.title || !sameInstant(saved.updated_at, sent.updated_at)) outcome.unconfirmed.push(sent.local_id);
  }
  return outcome;
}

function upsertNoteRows(rows) {
  return supabase.from("user_notes").upsert(rows, { onConflict: "auth_user_id,local_id" }).select();
}

// Media bytes/URIs remain device-local; the practice chain is backed up separately.
export async function syncNotesToServer(authUserId, notes) {
  if (!authUserId || !notes?.length) return { tombstoned: [], unconfirmed: [] };
  const rows = notes.map((n) => noteToRow(authUserId, n));
  let { data, error } = await upsertNoteRows(rows);
  // Older deployments can still back up the note itself. Never hide other schema,
  // authorization or network failures behind this compatibility fallback.
  if (isMissingPracticeMetaColumn(error)) {
    const legacyRows = rows.map(({ practice_meta, ...row }) => row);
    ({ data, error } = await upsertNoteRows(legacyRows));
  }
  if (error) throw error;
  return classifyUpsertResult(rows, data);
}
export async function syncSingleNote(authUserId, note) {
  const outcome = await syncNotesToServer(authUserId, [note]);
  if (outcome.tombstoned.length) throw new Error("NOTE_DELETED_ON_SERVER");
  if (outcome.unconfirmed.length) throw new Error("NOTE_UPLOAD_UNCONFIRMED");
  return outcome;
}

// Tombstones must reach every device. Filtering them out resurrects old local notes.
export async function fetchNotesFromServer(authUserId) {
  if (!authUserId) return [];
  const { data, error } = await supabase.from("user_notes").select("*")
    .eq("auth_user_id", authUserId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
function serverNoteToLocal(sn) {
  return {
    id: sn.local_id, title: sn.title, content: sn.content, field: sn.field || undefined,
    tags: sn.tags || [], seriesName: sn.series_name || undefined, starred: !!sn.starred,
    aiComment: sn.ai_comment || undefined, aiScores: sn.ai_scores || undefined,
    videoAnalysis: sn.video_analysis || undefined, aiModel: sn.ai_model || undefined,
    promptVersion: sn.prompt_version || undefined, transcript: sn.transcript || undefined,
    createdAt: sn.created_at, updatedAt: sn.updated_at,
    ...practiceMeta(sn.practice_meta),
  };
}
export function mergeNotes(localNotes, serverRows, tombstones = {}) {
  const deleted = new Set(Object.keys(tombstones));
  serverRows.filter((sn) => sn.deleted).forEach((sn) => deleted.add(String(sn.local_id)));
  const merged = new Map(localNotes.filter((n) => !deleted.has(String(n.id))).map((n) => [String(n.id), n]));
  for (const sn of serverRows) {
    if (deleted.has(String(sn.local_id))) continue;
    const local = merged.get(String(sn.local_id));
    if (!local) merged.set(String(sn.local_id), serverNoteToLocal(sn));
    else if (new Date(sn.updated_at) > new Date(local.updatedAt || local.createdAt)) {
      const server = serverNoteToLocal(sn);
      // A legacy server has no metadata. Keep a valid local chain in that case.
      merged.set(String(sn.local_id), {
        ...server, ...practiceMeta(local), ...practiceMeta(sn.practice_meta),
        images: local.images, voiceRecordings: local.voiceRecordings,
        audioFiles: local.audioFiles, pdfFiles: local.pdfFiles,
      });
    }
  }
  return [...merged.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
export async function deleteNoteFromServer(authUserId, localId, deletedAt = new Date().toISOString()) {
  if (!authUserId) return;
  // Upsert also records deletion of a note that was created and deleted offline.
  const { error } = await supabase.from("user_notes").upsert({
    auth_user_id: authUserId, local_id: localId, title: "", content: "",
    created_at: deletedAt, updated_at: deletedAt, deleted: true,
  }, { onConflict: "auth_user_id,local_id" });
  if (error) throw error;
}

const syncing = new Map();
// One sync at a time per account, with identity checked after every network wait.
// Callers supply a generation check so A's late response cannot update B's UI.
export function syncAccountNotes({ authUserId, scope, isCurrent = () => true, onChange = () => {} }) {
  const previous = syncing.get(scope) || Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    if (!isCurrent()) return;
    const rows = await fetchNotesFromServer(authUserId);
    if (!isCurrent()) return;
    const merged = await mutateNoteState(scope, (current) => {
      const tombstones = { ...current.tombstones };
      rows.filter((r) => r.deleted).forEach((r) => {
        tombstones[r.local_id] = { deletedAt: r.updated_at, synced: true };
      });
      return { notes: mergeNotes(current.notes, rows, tombstones), tombstones };
    });
    if (!isCurrent()) return;
    onChange(merged.notes);
    // Re-read after the durable merge so newly saved/deleted notes are included.
    const latest = await readNoteState(scope);
    if (!isCurrent()) return;
    const outcome = await syncNotesToServer(authUserId, latest.notes.filter((n) => !latest.tombstones[n.id]));
    if (!isCurrent()) return;
    // The server refused these as already deleted. Deletion wins: clean them up locally
    // instead of leaving a note the user believes is backed up.
    if (outcome.tombstoned.length) {
      const cleaned = await mutateNoteState(scope, (current) => {
        const tombstones = { ...current.tombstones };
        outcome.tombstoned.forEach(({ id, deletedAt }) => { tombstones[id] = { deletedAt, synced: true }; });
        return { notes: current.notes.filter((n) => !tombstones[n.id]), tombstones };
      });
      if (!isCurrent()) return;
      onChange(cleaned.notes);
    }
    for (const [id, tombstone] of Object.entries(latest.tombstones)) {
      if (!isCurrent()) return;
      if (tombstone.synced) continue;
      await deleteNoteFromServer(authUserId, id, tombstone.deletedAt);
      if (!isCurrent()) return;
      await mutateNoteState(scope, (current) => ({ ...current, tombstones: {
        ...current.tombstones, [id]: { ...current.tombstones[id], synced: true },
      } }));
    }
    // Rows the server answered with different contents were not stored. Fail the sync
    // so it is retried and nothing reports these notes as backed up.
    if (outcome.unconfirmed.length) throw new Error("NOTE_UPLOAD_UNCONFIRMED");
  });
  syncing.set(scope, run);
  run.finally(() => { if (syncing.get(scope) === run) syncing.delete(scope); }).catch(() => {});
  return run;
}
