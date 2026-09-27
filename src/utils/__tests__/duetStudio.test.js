import korean from "../../data/duet-scenes.json";
import english from "../../data/duet-scenes-en.json";
import { mergeDuetScenes, isValidRemoteData, sceneLanguage, voiceLanguage, parsePrivateScript, sceneDescription, rehearsalScript, rehearsalContextFor } from "../duetStudio";

const remoteScene = { id: "remote", play: "갱신된 장면", roles: [{ name: "A" }, { name: "B" }], lines: [{ r: 0, t: "안녕" }, { r: 1, t: "반가워" }] };
describe("global rehearsal collection", () => {
  it("ships ten complete original English scenes beside all existing Korean scenes", () => {
    const merged = mergeDuetScenes();
    expect(merged).toHaveLength(korean.scenes.length + 10);
    expect(new Set(merged.map((scene) => scene.id)).size).toBe(merged.length);
    expect(english.scenes).toHaveLength(10);
    english.scenes.forEach((scene) => {
      expect(scene.language).toBe("en");
      expect(scene.roles).toHaveLength(2);
      expect(scene.lines.length).toBeGreaterThanOrEqual(8);
      expect(scene.lines.length).toBeLessThanOrEqual(12);
      expect(new Set(scene.lines.map((line) => line.r))).toEqual(new Set([0, 1]));
      expect(scene.rights.type).toBe("artlink-original");
      expect(sceneDescription(scene, "ko", "label")).toMatch(/[가-힣]/);
      expect(sceneDescription(scene, "en", "point")).toBe(scene.point);
    });
  });
  it("refreshes Korean scenes without replacing protected English originals", () => {
    const forgedEnglish = { ...remoteScene, id: english.scenes[0].id };
    const merged = mergeDuetScenes({ version: 2, scenes: [remoteScene, forgedEnglish] });
    expect(merged).toHaveLength(11);
    expect(merged[0].id).toBe("remote");
    expect(merged.find((scene) => scene.id === english.scenes[0].id).play).toBe(english.scenes[0].play);
  });
  it.each([
    { ...remoteScene, lines: [{ r: 3, t: "invalid" }, { r: 0, t: "ok" }] },
    { ...remoteScene, roles: [{ name: "A" }, { name: "B" }, { name: "C" }] },
    { ...remoteScene, lines: [{ r: 0, t: {} }, { r: 1, t: "ok" }] },
    { ...remoteScene, language: "en" },
    { ...remoteScene, play: null },
    { ...remoteScene, author: { invalid: true } },
    { ...remoteScene, descriptionTranslations: { en: { label: { invalid: true } } } },
  ])("rejects remote shapes unsafe for the two-role renderer", (scene) => {
    const remote = { version: 2, scenes: [scene] };
    expect(isValidRemoteData(remote)).toBe(false);
    expect(mergeDuetScenes(remote)).toHaveLength(korean.scenes.length + 10);
  });
  it("rejects duplicate ids and old remote versions", () => {
    expect(isValidRemoteData({ version: 2, scenes: [remoteScene, remoteScene] })).toBe(false);
    expect(isValidRemoteData({ version: 0, scenes: [remoteScene] })).toBe(false);
  });
  it("routes English voice independently from app/guidance language", () => {
    expect(voiceLanguage(english.scenes[0])).toBe("en-US");
    expect(voiceLanguage(english.scenes[0], "en-GB")).toBe("en-GB");
    expect(voiceLanguage(korean.scenes[0], "en-GB")).toBe("ko-KR");
    expect(sceneLanguage(korean.scenes[0])).toBe("ko");
  });
});

describe("private script parser", () => {
  it("splits only the first colon, accepts CRLF, blank lines and consistent case-insensitive roles", () => {
    const result = parsePrivateScript("Alex: Meet me at 10:30.\r\n\r\nMAYA：I will.\r\nalex: Good.", "en", () => "private-test");
    expect(result.scene.id).toBe("private-test");
    expect(result.scene.roles.map((role) => role.name)).toEqual(["Alex", "MAYA"]);
    expect(result.scene.lines).toEqual([{ r: 0, t: "Meet me at 10:30." }, { r: 1, t: "I will." }, { r: 0, t: "Good." }]);
    expect(result.scene.isPrivate).toBe(true);
    expect(result.scene.source).toBe("private");
  });
  it.each([
    ["", "empty"], ["A: hello", "twoRoles"], ["A: one\nB: two\nC: three", "twoRoles"],
    ["A: hello\nUnlabelled continuation", "format"], ["A:\nB: hello", "format"],
    ["x".repeat(12001), "tooLong"],
    [Array.from({ length: 121 }, (_, i) => `${i % 2 ? "B" : "A"}: hi`).join("\n"), "tooManyLines"],
    [`A: ${"a".repeat(1001)}\nB: hi`, "format"],
  ])("validates a pasted script before rehearsal (%s)", (input, error) => {
    expect(parsePrivateScript(input).error).toBe(error);
  });
  it("reports the original failing line and never derives the id from private text", () => {
    expect(parsePrivateScript("A: hi\n\nunknown").line).toBe(3);
    const scene = parsePrivateScript("SecretName: confidential line\nOther: private response").scene;
    expect(scene.id).toMatch(/^private-[a-z0-9]+-[a-z0-9]+$/);
    expect(scene.id).not.toContain("SecretName");
    expect(scene.play).toBe("My private script");
  });
});

describe("rehearsal script sent with AI feedback", () => {
  const scene = { play: "Scene", language: "en", roles: [{ name: "MAYA" }, { name: "ALEX" }], lines: [
    { r: 1, t: "a".repeat(30) }, { r: 0, t: "mine one", d: "holds the key" }, { r: 1, t: "b".repeat(30) }, { r: 0, t: "mine two" },
  ] };

  it("labels every line with its speaker and keeps stage directions", () => {
    expect(rehearsalScript(scene, 0)).toBe(`ALEX: ${"a".repeat(30)}\nMAYA: (holds the key) mine one\nALEX: ${"b".repeat(30)}\nMAYA: mine two`);
  });

  it("keeps the user's lines first when the script is over the limit", () => {
    const script = rehearsalScript(scene, 0, 80);
    expect(script).toContain("MAYA: (holds the key) mine one");
    expect(script).toContain("MAYA: mine two");
    expect(script).toContain("…");
    expect(script.length).toBeLessThanOrEqual(80);
  });

  it("caps every bundled scene at 4,000 characters", () => {
    mergeDuetScenes().forEach((item) => expect(rehearsalScript(item, 0).length).toBeLessThanOrEqual(4000));
  });

  it("sends only role names and line counts for a pasted private script", () => {
    const { scene: privateScene } = parsePrivateScript("A: secret one\nB: secret two\nA: secret three", "en");
    const context = rehearsalContextFor(privateScene, 0, "ko");
    expect(context).toEqual({ sceneTitle: "My private script", role: "A", partnerRole: "B", scriptLanguage: "en", feedbackLanguage: "ko", userLineCount: 2, partnerLineCount: 1 });
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(rehearsalContextFor(scene, 1, "en").script).toContain("ALEX: " + "a".repeat(30));
  });
});
