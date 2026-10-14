// Explicit sharing projection. Local media paths, transcripts, profile fields,
// scores and unrelated notes must never be included in a group submission.
export function submissionPreview(note) {
  if (!note || note.id === undefined || note.id === null) return null;
  const text = value => typeof value === 'string' ? value.trim() : '';
  const preview = {
    noteKey: String(note.id),
    noteTitle: text(note.title) || '연습 기록 / Practice note',
    practiceText: text(note.content),
    aiFeedback: [...new Set([text(note.aiComment), text(note.videoAnalysis)].filter(Boolean))].join('\n\n'),
  };
  if (!preview.practiceText && !preview.aiFeedback) return null;
  // Do not silently cut a student's work. The UI explains oversize records.
  if (preview.noteKey.length > 128 || preview.noteTitle.length > 120 || preview.practiceText.length > 12000 || preview.aiFeedback.length > 20000) return null;
  return preview;
}
