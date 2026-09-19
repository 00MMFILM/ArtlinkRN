import { normalizeDeeplinkSource } from "../deeplinkSource";

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
