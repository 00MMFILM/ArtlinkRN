import { buildRepracticePrefill, findResumeTarget, parseTimeMarks } from "../repractice";

const now = Date.parse("2026-09-27T12:00:00Z");
const makeNote = (id, days, extra = {}) => ({ id, createdAt: new Date(now - days * 86400000).toISOString(), chosenFocus: "호흡", focusOptions: ["호흡"], ...extra });

describe("retake prefill", () => {
  it("keeps the root, scene and chosen focus without copying media, analysis, or the completed session", () => {
    const original = { id: 21, title: "독백", field: "acting", sceneId: "scene-a", rootNoteId: 1, chosenFocus: "호흡", images: [{ uri: "old" }], videoAnalysis: "old", content: "old", practiceSessionId: "session-a", tags: ["private"] };
    expect(buildRepracticePrefill(original)).toEqual({ title: "독백", field: "acting", seriesName: "독백", rootNoteId: 1, parentNoteId: 21, sceneId: "scene-a", focus: "호흡" });
    expect(original.images).toHaveLength(1);
    expect(buildRepracticePrefill({ id: 1 }).rootNoteId).toBe(1);
    expect(buildRepracticePrefill(null)).toBeNull();
    expect(buildRepracticePrefill({ title: "unsaved" })).toBeNull();
  });
});

describe("resume targets", () => {
  it("chooses the newest uncontinued valid focus within 14 days without mutating input", () => {
    const notes = [makeNote(1, 1), makeNote(2, 2), makeNote(3, 0, { parentNoteId: "1", chosenFocus: null }), makeNote(4, 0, { chosenFocus: "stale" })];
    expect(findResumeTarget(notes, now).id).toBe(2);
    expect(notes.map((n) => n.id)).toEqual([1, 2, 3, 4]);
  });
  it("excludes future, expired, invalid and empty selections; includes the 14-day boundary", () => {
    const invalid = [makeNote(1, -1), makeNote(2, 14.01), makeNote(3, 1, { createdAt: "bad" }), makeNote(4, 1, { chosenFocus: "  " }), null];
    expect(findResumeTarget(invalid, now)).toBeNull();
    expect(findResumeTarget([...invalid, makeNote(5, 14)], now).id).toBe(5);
    expect(findResumeTarget([], NaN)).toBeNull();
  });
});

describe("video timestamp chips", () => {
  it("deduplicates positions and rejects invalid seconds, hours, URLs and points past duration", () => {
    expect(parseTimeMarks("🎯 0:03 00:03 [1:05] 1:60 2:9 1:02:03 https://x:22 9:59 0:00", 65000)).toEqual([
      { label: "0:03", positionMs: 3000 }, { label: "1:05", positionMs: 65000 }, { label: "0:00", positionMs: 0 },
    ]);
    expect(parseTimeMarks(null)).toEqual([]);
    expect(parseTimeMarks("0:00 0:01", 0)).toEqual([{ label: "0:00", positionMs: 0 }]);
  });
});
