// 딥링크 source 이벤트 정규화 — 서버 화이트리스트(deeplink_actraw, deeplink_bium, deeplink_external) 밖 값을
// 그대로 보내면 400이 난다. 화이트리스트에 없는 source는 external로 정규화한다.
const KNOWN_SOURCES = ["actraw", "bium"];

export function normalizeDeeplinkSource(source) {
  return typeof source === "string" && KNOWN_SOURCES.includes(source) ? source : "external";
}

// 웹 브릿지를 거치지 않은 artlink:// 링크도 같은 규칙으로 검증한다.
// ACT RAW의 stable ID만 허용한다. 제목·본문·임의 URL을 장면 식별자로 보내지 않는다.
export function normalizePracticeSceneId(query = {}) {
  if (query.source !== "actraw") return null;
  if (query.sceneId !== undefined) {
    return typeof query.sceneId === "string" && /^actraw:[a-z0-9][a-z0-9_-]{0,63}$/.test(query.sceneId)
      ? query.sceneId : null;
  }
  return typeof query.m === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(query.m)
    ? `actraw:${query.m}` : null;
}
