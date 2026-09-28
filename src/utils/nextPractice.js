// A recent result without a chosen next step should not disappear into the notes list.
// Exclude check-ins, parents that already have a next take, and stale/future notes.
export function findFeedbackToReview(notes, now = Date.now()) {
  if (!Array.isArray(notes) || !Number.isFinite(now)) return null;
  const parents = new Set(notes.filter(Boolean).map(n => n.parentNoteId)
    .filter(id => id !== null && id !== undefined).map(String));
  return notes.filter(n => {
    if (!n || n.id === null || n.id === undefined || n.type === "checkin" || parents.has(String(n.id))) return false;
    if (typeof n.chosenFocus === "string" && n.chosenFocus.trim()) return false;
    // Older feedback has no selectable focus. Do not promise an action the detail
    // screen cannot show, or force another paid analysis just to make it appear.
    if (!Array.isArray(n.focusOptions) || !n.focusOptions.some(value => typeof value === "string" && value.trim())) return false;
    const hasFeedback = [n.aiComment, n.videoAnalysis].some(value => typeof value === "string" && value.trim());
    const at = new Date(n.createdAt).getTime();
    return hasFeedback && Number.isFinite(at) && at <= now && at >= now - 14 * 86400000;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}
