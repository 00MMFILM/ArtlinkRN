// 빠른 체크인 저장 — 홈(오늘의 연습)과 가입 직후 첫 체크인이 같은 노트·같은 계측을 남기도록 한 곳에 둔다.
// 저장은 호출한 화면의 saveNote(=AppContext handleSaveNote)로 하고, 여기서는 제목 규칙과 계측만 맡는다.
import i18n from "i18next";
import { trackFunnelEvent } from "./mauService";
import { startPractice, completePractice } from "./practiceService";

/** 체크인 세션이 없으면 만들어 준다 — 메모를 건드리지 않고 바로 저장해도 연습 1회로 잡히게. */
export function ensureCheckinSession(session, field) {
  return session || startPractice("checkin", field, field);
}

export async function saveCheckinNote({ field, memo, session, saveNote }) {
  const title = (memo || "").trim() || i18n.t("fields." + field) + " " + i18n.t("notes.checkin_badge");
  const noteId = await saveNote({
    title,
    field,
    type: "checkin",
    // 이 체크인이 어느 연습 세션에서 나왔는지 — 연습 기록(getPracticeLog)과 중복 집계 방지
    practiceSessionId: session?.sessionId,
  });
  // 홈 체크인도 노트 저장이다 — 계측이 빠져 있어 실사용 저장의 75%가 집계되지 않았다(2026-09-07)
  trackFunnelEvent("note_saved", i18n.language);
  if (session) completePractice(session, { subjectKey: field, field });
  return noteId;
}
