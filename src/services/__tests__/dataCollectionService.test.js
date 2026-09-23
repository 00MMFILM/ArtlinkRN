jest.mock("../supabaseClient", () => ({ supabase: { from: jest.fn() } }));
jest.mock("../../utils/storage", () => ({ safeStorageGet: jest.fn(async () => "test-device"), STORAGE_KEYS: { DEVICE_ID: "device" } }));
jest.mock("../apiConfig", () => ({ SERVER_URL: "https://server.test", getApiHeaders: () => ({}) }));

const { supabase } = require("../supabaseClient");
const { submitTrainingData, submitAnonymousMetadata, withdrawMediaConsent } = require("../dataCollectionService");

beforeEach(() => jest.clearAllMocks());

it("pauses new full-text collection without touching old records", async () => {
  await expect(submitTrainingData({ noteContent: "private words", aiFeedback: "private feedback" }))
    .resolves.toEqual({ submitted: false, reason: "collection_paused" });
  expect(supabase.from).not.toHaveBeenCalled();
});

it("sends only fixed categories and counts, never free text or tags", async () => {
  const insert = jest.fn(async () => ({}));
  supabase.from.mockReturnValue({ insert });
  await submitAnonymousMetadata({ field: "private school", noteTitle: "private title", aiFeedback: "🎯 private feedback", tags: ["private person"], userType: "private name" });
  const payload = insert.mock.calls[0][0];
  expect(JSON.stringify(payload)).not.toContain("private");
  expect(payload).toMatchObject({ field: "etc", user_type: "unknown", tags: [], feedback_sections: null, note_title_hash: null, feedback_length: 19 });
});

it.each([{ ok: true, deleted: 0 }, { ok: true, complete: false }, { ok: false }])("does not call an unconfirmed withdrawal complete: %j", async (body) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => body }));
  await expect(withdrawMediaConsent()).rejects.toThrow("withdraw not confirmed");
});

it("recognizes only the explicitly scoped confirmed archive withdrawal", async () => {
  const body = { ok: true, complete: true, scope: "authenticated_media_archive", excludes: ["training_data", "guest_media_archive"] };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => body }));
  await expect(withdrawMediaConsent()).resolves.toEqual(body);
});
