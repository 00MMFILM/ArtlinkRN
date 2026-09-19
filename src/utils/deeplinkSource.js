// 딥링크 source 이벤트 정규화 — 서버 화이트리스트(deeplink_actraw, deeplink_bium, deeplink_external) 밖 값을
// 그대로 보내면 400이 난다. 화이트리스트에 없는 source는 external로 정규화한다.
const KNOWN_SOURCES = ["actraw", "bium"];

export function normalizeDeeplinkSource(source) {
  return typeof source === "string" && KNOWN_SOURCES.includes(source) ? source : "external";
}
