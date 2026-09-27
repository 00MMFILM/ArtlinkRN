import { sanitizeStudioMetadata, studioFeedbackContext } from "../studioMetadata";

describe("portable studio metadata boundary", () => {
  it("keeps the selected languages and role without copying media or arbitrary route data", () => {
    const source = {
      feedbackLanguage: "ko", scriptLanguage: "en", admin: true,
      rehearsalContext: { sceneTitle: " Scene ", role: " Lear ", scriptLanguage: "en", feedbackLanguage: "ko", recording: { uri: "file:///old.m4a" } },
    };
    expect(sanitizeStudioMetadata(source)).toEqual({
      feedbackLanguage: "ko", scriptLanguage: "en",
      rehearsalContext: { sceneTitle: "Scene", role: "Lear", scriptLanguage: "en", feedbackLanguage: "ko" },
    });
    expect(sanitizeStudioMetadata({ feedbackLanguage: "en-US", scriptLanguage: {}, rehearsalContext: [] })).toEqual({});
    expect(studioFeedbackContext(source)).toContain("metadata, not performance evidence");
    expect(studioFeedbackContext(source)).not.toContain("file:///old");
  });

  it("bounds application country and submission requirements through the same whitelist", () => {
    const meta = sanitizeStudioMetadata({ applicationContext: {
      postId: 42, title: " Film ", country: "x".repeat(200),
      submissions: [null, 7, " ", ...Array.from({ length: 20 }, () => "y".repeat(200))],
      requirements: { language: "English", rawResponse: "not portable" },
      secret: "not portable", video: { uri: "file:///old.mov" },
    } });
    expect(meta.applicationContext.country).toHaveLength(160);
    expect(meta.applicationContext.submissions).toHaveLength(12);
    expect(meta.applicationContext.submissions.every((value) => value.length === 160)).toBe(true);
    expect(meta.applicationContext.requirements).toEqual({ language: "English" });
    expect(meta.applicationContext.title).toBe("Film");
    expect(meta.applicationContext.postId).toBe(42);
    expect(meta.applicationContext.secret).toBeUndefined();
    expect(meta.applicationContext.video).toBeUndefined();
  });

  it("keeps the speaker-labelled script and line counts through notes, drafts, and sync", () => {
    const meta = sanitizeStudioMetadata({ rehearsalContext: {
      role: "MAYA", partnerRole: " ALEX ", script: "x".repeat(5000), userLineCount: 5, partnerLineCount: -1, extra: "no",
    } });
    expect(meta.rehearsalContext.partnerRole).toBe("ALEX");
    expect(meta.rehearsalContext.script).toHaveLength(4000);
    expect(meta.rehearsalContext.userLineCount).toBe(5);
    expect(meta.rehearsalContext.partnerLineCount).toBeUndefined();
    expect(meta.rehearsalContext.extra).toBeUndefined();
  });

  it("tells the model which lines are the user's and forbids invented props", () => {
    const text = studioFeedbackContext({ rehearsalContext: { role: "MAYA", partnerRole: "ALEX", script: "ALEX: You left this.\nMAYA: My key." } });
    expect(text).toContain("ALEX: You left this.\nMAYA: My key.");
    expect(text).toContain('Only lines labelled "MAYA" in this script are the user\'s');
    expect(text).toContain("may also contain the partner's lines");
    expect(text).toContain("Do not add props");
    expect(text).not.toContain('"script"');
    const withoutScript = studioFeedbackContext({ rehearsalContext: { role: "A", userLineCount: 2, partnerLineCount: 1 } });
    expect(withoutScript).toContain("No script text is provided");
    expect(withoutScript).toContain('"userLineCount":2');
  });
});
