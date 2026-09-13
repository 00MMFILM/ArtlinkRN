// 작성 중인 노트 초안 보관 — 가입 왕복(게스트 → 인증 화면 → 앱)에서 NoteCreate가
// 언마운트되며 초안이 사라지는 걸 막는다. 저장은 반드시 되읽어 확인한 뒤 true를 준다.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const DRAFT_KEY = "artlink-note-draft";

const TEXT_FIELDS = ["title", "content", "field", "seriesName", "aiComment", "videoAnalysis"];
const LIST_FIELDS = ["tags", "images", "voiceRecordings", "audioFiles", "pdfFiles"];

// 초안에서 실제 "내용"으로 칠 것 — 제목만 있는 건 보관하지 않는다
const hasSubstance = (d) =>
  !!(d.content || "").trim() ||
  !!(d.aiComment || "").trim() ||
  !!(d.videoAnalysis || "").trim() ||
  LIST_FIELDS.slice(1).some((k) => Array.isArray(d[k]) && d[k].length > 0);

// 보관할 만한 내용이 있는지 — 없으면 애초에 저장할 것도, 잃을 것도 없다
export function hasDraftContent(state = {}) {
  return hasSubstance(buildDraft(state));
}

export function buildDraft(state = {}) {
  const draft = {};
  TEXT_FIELDS.forEach((k) => {
    draft[k] = typeof state[k] === "string" ? state[k] : "";
  });
  LIST_FIELDS.forEach((k) => {
    draft[k] = Array.isArray(state[k]) ? state[k] : [];
  });
  draft.aiScores = state.aiScores && typeof state.aiScores === "object" ? state.aiScores : null;
  // 연습 세션 id — 가입 왕복이 연습 2회로 세이지 않게 복원 때 이어받는다 (내용 아님)
  draft.sessionId = typeof state.sessionId === "string" ? state.sessionId : null;
  draft.savedAt = Date.now();
  return draft;
}

// 저장된 값을 화면 초기화에 쓸 수 있는 모양으로 정규화. 쓸 내용이 없으면 null.
export function validateDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const draft = {};
  TEXT_FIELDS.forEach((k) => {
    draft[k] = typeof raw[k] === "string" ? raw[k] : "";
  });
  LIST_FIELDS.forEach((k) => {
    draft[k] = Array.isArray(raw[k]) ? raw[k] : [];
  });
  draft.aiScores = raw.aiScores && typeof raw.aiScores === "object" ? raw.aiScores : null;
  draft.sessionId = typeof raw.sessionId === "string" ? raw.sessionId : null;
  draft.savedAt = typeof raw.savedAt === "number" ? raw.savedAt : 0;
  return hasSubstance(draft) ? draft : null;
}

// 저장 성공(setItem resolve + 되읽기 일치)했을 때만 true. 실패를 성공으로 보고하지 않는다.
export async function saveDraft(state) {
  try {
    const draft = buildDraft(state);
    if (!hasSubstance(draft)) return false;
    const json = JSON.stringify(draft);
    await AsyncStorage.setItem(DRAFT_KEY, json);
    const readBack = await AsyncStorage.getItem(DRAFT_KEY);
    return readBack === json;
  } catch {
    return false;
  }
}

export async function loadDraft() {
  try {
    const json = await AsyncStorage.getItem(DRAFT_KEY);
    if (!json) return null;
    return validateDraft(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {}
}
