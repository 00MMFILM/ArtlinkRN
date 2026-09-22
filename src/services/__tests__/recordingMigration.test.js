import { migrateCachedRecordings } from "../recordingMigration";

jest.mock("expo-file-system/legacy", () => ({}));

const makeFs = (existing = []) => {
  const files = new Set(existing);
  return {
    cacheDirectory: "file:///cache/",
    documentDirectory: "file:///doc/",
    getInfoAsync: jest.fn(async (u) => ({ exists: files.has(u) || u === "file:///doc/media/" })),
    makeDirectoryAsync: jest.fn(async () => {}),
    copyAsync: jest.fn(async ({ to }) => { files.add(to); }),
  };
};

describe("캐시 녹음 → 문서 폴더 이관 (1.11.6 이전 노트)", () => {
  it("남아 있는 캐시 녹음은 옮기고 uri를 바꾼다, 다른 노트·첨부는 그대로", async () => {
    const fs = makeFs(["file:///cache/Audio/a.m4a"]);
    const notes = [
      { id: 1, title: "a", voiceRecordings: [{ uri: "file:///cache/Audio/a.m4a", duration: 5 }, { uri: "file:///doc/media/keep.m4a", duration: 3 }] },
      { id: 2, title: "b", voiceRecordings: [] },
    ];
    const out = await migrateCachedRecordings(notes, fs);
    expect(out[0].voiceRecordings[0].uri).toMatch(/^file:\/\/\/doc\/media\/1_[a-z0-9]+\.m4a$/);
    expect(out[0].voiceRecordings[0].duration).toBe(5);
    expect(out[0].voiceRecordings[1].uri).toBe("file:///doc/media/keep.m4a");
    expect(out[1]).toBe(notes[1]);
  });

  it("이미 사라진 캐시 파일은 건드리지 않고, 옮길 게 없으면 null", async () => {
    const fs = makeFs([]);
    const notes = [{ id: 1, voiceRecordings: [{ uri: "file:///cache/Audio/gone.m4a", duration: 2 }] }];
    await expect(migrateCachedRecordings(notes, fs)).resolves.toBeNull();
    expect(fs.copyAsync).not.toHaveBeenCalled();
  });

  it("캐시 녹음이 없는 사용자는 파일 시스템을 건드리지 않는다", async () => {
    const fs = makeFs([]);
    await expect(migrateCachedRecordings([{ id: 1, voiceRecordings: [{ uri: "file:///doc/media/x.m4a" }] }], fs)).resolves.toBeNull();
    expect(fs.getInfoAsync).not.toHaveBeenCalled();
  });

  it("복사가 실패하면 원래 uri를 유지한다", async () => {
    const fs = makeFs(["file:///cache/Audio/a.m4a"]);
    fs.copyAsync.mockRejectedValue(new Error("disk full"));
    await expect(migrateCachedRecordings([{ id: 1, voiceRecordings: [{ uri: "file:///cache/Audio/a.m4a" }] }], fs)).resolves.toBeNull();
  });
});
