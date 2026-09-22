jest.mock("../apiConfig", () => ({ SERVER_URL: "https://srv.test" }));

const { fnv1a, loadVoiceManifest, voiceUrlFor, __resetVoiceManifest } = require("../duetVoice");

const manifest = { version: 1, scenes: { "hamlet-ophelia-nunnery": { "7": fnv1a("이거요."), "0": fnv1a("안녕") } } };
const okFetch = (j) => jest.fn(() => Promise.resolve({ ok: true, json: async () => j }));

describe("duetVoice", () => {
  beforeEach(() => {
    __resetVoiceManifest();
    jest.useRealTimers();
  });

  it("fnv1a 검증값: '이거요.' → 48bb270b", () => {
    expect(fnv1a("이거요.")).toBe("48bb270b");
    expect(fnv1a("")).toBe("811c9dc5");
  });

  it("해시가 맞으면 두 자리 줄 번호 mp3 URL, 다르면 null", async () => {
    global.fetch = okFetch(manifest);
    await loadVoiceManifest();
    expect(global.fetch).toHaveBeenCalledWith("https://srv.test/duet-voice/manifest.json");
    expect(voiceUrlFor("hamlet-ophelia-nunnery", 7, "이거요.")).toBe("https://srv.test/duet-voice/hamlet-ophelia-nunnery/07.mp3");
    expect(voiceUrlFor("hamlet-ophelia-nunnery", 7, "이거요!")).toBeNull(); // 대사 변경
    expect(voiceUrlFor("hamlet-ophelia-nunnery", 3, "이거요.")).toBeNull(); // 파일 없는 줄(말줄임 등)
    expect(voiceUrlFor("other-scene", 0, "안녕")).toBeNull();
  });

  it("manifest를 받기 전에는 null", () => {
    expect(voiceUrlFor("hamlet-ophelia-nunnery", 7, "이거요.")).toBeNull();
  });

  it("한 번 받으면 캐시하고 다시 요청하지 않는다", async () => {
    global.fetch = okFetch(manifest);
    await loadVoiceManifest();
    await loadVoiceManifest();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("실패하면 null로 끝나고, 다음 호출(다음 화면 진입) 때 다시 시도한다", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
    await expect(loadVoiceManifest()).resolves.toBeNull();
    expect(voiceUrlFor("hamlet-ophelia-nunnery", 7, "이거요.")).toBeNull();

    global.fetch = okFetch(manifest);
    await loadVoiceManifest();
    expect(voiceUrlFor("hamlet-ophelia-nunnery", 7, "이거요.")).not.toBeNull();
  });

  it("HTTP 오류·형식이 이상한 응답은 캐시하지 않는다", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: async () => manifest }));
    await expect(loadVoiceManifest()).resolves.toBeNull();
    global.fetch = okFetch({ version: 1, scenes: [] });
    await expect(loadVoiceManifest()).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("8초 안에 응답이 없으면 포기한다", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise(() => {})); // 영원히 대기
    const p = loadVoiceManifest();
    jest.advanceTimersByTime(7999);
    let settled = false;
    p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(p).resolves.toBeNull();
  });
});
