import { sanitizeStudioMetadata } from "./studioMetadata";

// Keep each new take independent: carry the scene and intent, never media or results.
export function buildRepracticePrefill(note) {
  if (!note || note.id === undefined || note.id === null) return null;
  return {
    ...sanitizeStudioMetadata(note),
    title: note.title || "",
    field: note.field,
    seriesName: note.seriesName || note.title || "",
    rootNoteId: note.rootNoteId ?? note.id,
    parentNoteId: note.id,
    sceneId: note.sceneId || undefined,
    focus: typeof note.chosenFocus === "string" ? note.chosenFocus.trim() : null,
  };
}

export function findResumeTarget(notes, now = Date.now()) {
  if (!Array.isArray(notes) || !Number.isFinite(now)) return null;
  const parents = new Set(notes.filter(Boolean).map((n) => n.parentNoteId).filter((v) => v !== null && v !== undefined).map(String));
  const cutoff = now - 14 * 24 * 60 * 60 * 1000;
  return notes.filter((note) => {
    if (!note || note.id === undefined || note.id === null || parents.has(String(note.id))) return false;
    if (typeof note.chosenFocus !== "string" || !note.chosenFocus.trim()) return false;
    if (Array.isArray(note.focusOptions) && note.focusOptions.length && !note.focusOptions.includes(note.chosenFocus)) return false;
    const at = new Date(note.createdAt).getTime();
    return Number.isFinite(at) && at >= cutoff && at <= now;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

// Only m:ss timestamps, never a suffix of h:mm:ss, malformed seconds or a URL.
export function parseTimeMarks(text, durationMs) {
  if (typeof text !== "string") return [];
  const marks = [];
  const seen = new Set();
  const limit = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : Infinity;
  const re = /(^|[^\d:A-Za-z/])(\d{1,3}):([0-5]\d)(?![\d:])/g;
  let match;
  while ((match = re.exec(text))) {
    const positionMs = (Number(match[2]) * 60 + Number(match[3])) * 1000;
    if (positionMs > limit || seen.has(positionMs)) continue;
    seen.add(positionMs);
    marks.push({ label: `${Number(match[2])}:${match[3]}`, positionMs });
  }
  return marks;
}
