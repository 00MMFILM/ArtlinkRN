import { uploadProfilePhotos } from "../profileService";
import { supabase } from "../supabaseClient";
import { createMediaId } from "../mediaFileId";

jest.mock("../supabaseClient", () => ({ supabase: { storage: { from: jest.fn() } } }));
jest.mock("../apiConfig", () => ({ SERVER_URL: "https://server.test", getApiHeaders: () => ({}) }));
jest.mock("../../utils/storage", () => ({ safeStorageGet: async () => "owner-token", STORAGE_KEYS: {} }));
jest.mock("../mediaFileId", () => ({ createMediaId: jest.fn() }));
let upload;
beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  createMediaId.mockImplementation(() => `unique-${++n}`);
  upload = jest.fn(async () => ({ error: null }));
  supabase.storage.from.mockReturnValue({ upload, getPublicUrl: (path) => ({ data: { publicUrl: `https://photos.test/${path}` } }) });
  global.Response = class { async arrayBuffer() { return new ArrayBuffer(1); } };
  global.fetch = jest.fn(async (url) => url.startsWith("file:")
    ? { blob: async () => ({}) }
    : { ok: true, json: async () => ({ ok: true }) });
});
it("successive one-photo batches use different objects with overwrite disabled", async () => {
  await uploadProfilePhotos("user", ["file:///a.jpg"]);
  await uploadProfilePhotos("user", ["file:///b.jpg"]);
  expect(upload.mock.calls[0][0]).not.toBe(upload.mock.calls[1][0]);
  expect(upload.mock.calls.every(([, , opts]) => opts.upsert === false)).toBe(true);
});
it("appending a photo preserves earlier photos and the selected cover on the server", async () => {
  const old = "https://photos.test/cover.jpg";
  const [added] = await uploadProfilePhotos("user", ["file:///b.jpg"], [old, "file:///b.jpg"]);
  const [, req] = global.fetch.mock.calls.find(([url]) => url.endsWith("profile-sync"));
  expect(JSON.parse(req.body).profile).toEqual({ photos: [old, added], photoUrl: old, _photosOnly: true });
});
it("rejects a failed profile update even after the object upload succeeded", async () => {
  global.fetch.mockImplementation(async (url) => url.startsWith("file:")
    ? { blob: async () => ({}) }
    : { ok: false, json: async () => ({ error: "ownership verification failed" }) });
  await expect(uploadProfilePhotos("user", ["file:///b.jpg"])).rejects.toThrow("ownership verification failed");
});
it("does not mark a malformed success response as a committed photo update", async () => {
  global.fetch.mockImplementation(async (url) => url.startsWith("file:")
    ? { blob: async () => ({}) }
    : { ok: true, json: async () => ({}) });
  await expect(uploadProfilePhotos("user", ["file:///b.jpg"])).rejects.toThrow("photo sync failed");
});
