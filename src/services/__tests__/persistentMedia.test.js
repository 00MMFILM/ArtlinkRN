import * as FileSystem from "expo-file-system/legacy";
import { createMediaId } from "../mediaFileId";
import { preserveMediaFile } from "../persistentMedia";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async () => ({ exists: true })),
}));
jest.mock("../mediaFileId", () => ({ createMediaId: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  createMediaId.mockImplementation(() => `unique-${++n}`);
  FileSystem.copyAsync.mockResolvedValue(undefined);
  FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
});

it("copies repeated cache filenames into different permanent files without deleting originals", async () => {
  const first = await preserveMediaFile("file:///cache/photo.jpg");
  const second = await preserveMediaFile("file:///cache/photo.jpg");
  expect(first).toBe("file:///documents/media/unique-1.jpg");
  expect(second).not.toBe(first);
  expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: "file:///cache/photo.jpg", to: first });
});
it("propagates a full-disk copy failure instead of returning a cache URI", async () => {
  FileSystem.copyAsync.mockRejectedValue(new Error("disk full"));
  await expect(preserveMediaFile("file:///cache/photo.jpg")).rejects.toThrow("disk full");
});
it("rejects a missing durable file and a copy that did not create a file", async () => {
  FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
  await expect(preserveMediaFile("file:///documents/media/gone.jpg")).rejects.toThrow("MEDIA_FILE_MISSING");
  await expect(preserveMediaFile("file:///cache/new.jpg")).rejects.toThrow("MEDIA_COPY_FAILED");
});
it("leaves remote and verified permanent files intact", async () => {
  expect(await preserveMediaFile("https://test.example/photo.jpg")).toBe("https://test.example/photo.jpg");
  expect(await preserveMediaFile("file:///documents/media/a.jpg")).toBe("file:///documents/media/a.jpg");
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
});
