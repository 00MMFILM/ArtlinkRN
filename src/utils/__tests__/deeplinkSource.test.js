import { normalizeDeeplinkSource, normalizePracticeSceneId } from "../deeplinkSource";

// 버그: 딥링크 source를 그대로 보내 서버 화이트리스트(actraw/bium/external) 밖이면 400이 났다(2026-09)
describe("normalizeDeeplinkSource", () => {
  it("actraw·bium은 그대로 통과시킨다", () => {
    expect(normalizeDeeplinkSource("actraw")).toBe("actraw");
    expect(normalizeDeeplinkSource("bium")).toBe("bium");
  });

  it("화이트리스트 밖 값은 external로 정규화한다", () => {
    expect(normalizeDeeplinkSource("some_other_partner")).toBe("external");
    expect(normalizeDeeplinkSource("naver")).toBe("external");
  });

  it("빈 값·undefined·문자열이 아닌 값도 external로 정규화한다", () => {
    expect(normalizeDeeplinkSource("")).toBe("external");
    expect(normalizeDeeplinkSource(undefined)).toBe("external");
    expect(normalizeDeeplinkSource(null)).toBe("external");
    expect(normalizeDeeplinkSource(123)).toBe("external");
  });
});

describe("normalizePracticeSceneId", () => {
  it("브릿지의 ACT RAW sceneId와 직접 링크의 m이 같은 장면으로 이어진다", () => {
    expect(normalizePracticeSceneId({ source: "actraw", sceneId: "actraw:hamlet-tobe" })).toBe("actraw:hamlet-tobe");
    expect(normalizePracticeSceneId({ source: "actraw", m: "hamlet-tobe" })).toBe("actraw:hamlet-tobe");
  });

  it("실제 최장 62자 ID를 자르지 않고 69자 sceneId로 보존한다", () => {
    const id = "daehanmingukeseo-geonmulju-doeneun-beop-jangdongcheol-ibanseok";
    const sceneId = `actraw:${id}`;
    expect(sceneId.length).toBe(69);
    expect(normalizePracticeSceneId({ source: "actraw", m: id })).toBe(sceneId);
    expect(normalizePracticeSceneId({ source: "actraw", sceneId })).toBe(sceneId);
  });

  it.each(["", undefined, null, 123, ["hamlet-tobe"], "../x", "a b", "Hamlet", "대본 제목", "<script>", "a".repeat(65)])("잘못된 m은 장면으로 쓰지 않는다: %p", (m) => {
    expect(normalizePracticeSceneId({ source: "actraw", m })).toBeNull();
  });

  it.each(["", null, ["actraw:hamlet-tobe"], "hamlet-tobe", "actraw:../x", `actraw:${"a".repeat(65)}`])("잘못된 canonical sceneId는 통과하지 않는다: %p", (sceneId) => {
    expect(normalizePracticeSceneId({ source: "actraw", sceneId })).toBeNull();
  });

  it("다른 출처·제목만 있는 기존 링크에는 장면을 만들어 붙이지 않는다", () => {
    expect(normalizePracticeSceneId({ source: "bium", m: "hamlet-tobe" })).toBeNull();
    expect(normalizePracticeSceneId({ source: "external", sceneId: "actraw:hamlet-tobe" })).toBeNull();
    expect(normalizePracticeSceneId({ source: "actraw", title: "햄릿" })).toBeNull();
    expect(normalizePracticeSceneId()).toBeNull();
  });
});
