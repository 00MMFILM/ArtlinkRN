// 2인 대사 연습 — 미리 만든 성우 톤 음성 파일 목록(manifest)
// manifest: { version, scenes: { <sceneId>: { <줄 인덱스>: <원문 해시> } } }
// 원격 씬 대사가 바뀌면 해시가 달라진다 — 해시가 맞을 때만 파일 URL을 주고, 아니면 null(기기 TTS로 대체).
import { SERVER_URL } from "./apiConfig";

const BASE = `${SERVER_URL}/duet-voice`;
const TIMEOUT_MS = 8000;

let manifest = null; // 성공한 manifest만 캐시 — 실패하면 다음 화면 진입 때 다시 시도
let pending = null;

// FNV-1a 32비트 (UTF-16 코드 유닛 단위), 소문자 16진 8자리
export function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function loadVoiceManifest() {
  if (manifest) return Promise.resolve(manifest);
  if (pending) return pending;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS); });
  pending = Promise.race([fetch(`${BASE}/manifest.json`).then((r) => (r.ok ? r.json() : null)), timeout])
    .then((j) => {
      if (j && j.scenes && typeof j.scenes === "object" && !Array.isArray(j.scenes)) manifest = j;
      return manifest;
    })
    .catch(() => null)
    .finally(() => { clearTimeout(timer); pending = null; });
  return pending;
}

// manifest를 아직 못 받았거나 해시가 다르면 null
export function voiceUrlFor(sceneId, idx, text) {
  const entry = manifest?.scenes?.[sceneId];
  const hash = entry?.[String(idx)];
  if (!hash || typeof text !== "string" || hash !== fnv1a(text)) return null;
  return `${BASE}/${sceneId}/${String(idx).padStart(2, "0")}.mp3`;
}

// 테스트용
export function __resetVoiceManifest() { manifest = null; pending = null; }
