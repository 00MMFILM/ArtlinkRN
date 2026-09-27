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
});
