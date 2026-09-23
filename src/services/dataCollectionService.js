import { supabase } from "./supabaseClient";
import { safeStorageGet, STORAGE_KEYS } from "../utils/storage";
import { SERVER_URL, getApiHeaders } from "./apiConfig";

/**
 * Training collection is paused; keep the entry point compatible with older callers.
 */
export async function submitTrainingData() {
  // Legacy records have no owner and cannot be individually withdrawn.
  // Resume only after a server-managed consent/ownership/deletion contract exists.
  return { submitted: false, reason: "collection_paused" };
}

/**
 * Submit bounded operational metadata, without user-authored content.
 * The legacy table/function name says anonymous, but a device identifier is retained.
 */
export async function submitAnonymousMetadata({ field, aiFeedback, userType }) {
  try {
    const deviceId = await safeStorageGet(STORAGE_KEYS.DEVICE_ID);
    const feedbackLength = (aiFeedback || "").length;
    const allowedFields = new Set(["acting", "music", "dance", "art", "film", "literature", "etc"]);
    const allowedTypes = new Set(["professional", "aspiring", "hobby", "industry", "fan"]);
    await supabase.from("anonymous_ai_metadata").insert({
      device_id: deviceId || "unknown",
      field: allowedFields.has(field) ? field : "etc",
      note_title_hash: null,
      feedback_length: feedbackLength,
      feedback_sections: null,
      tags: [],
      user_type: allowedTypes.has(userType) ? userType : "unknown",
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Silent fail — anonymous tracking is best-effort
  }
}

/**
 * 학습자산 동의 철회 — 서버에 보관된 자료 삭제 요청.
 * 로그인 계정의 미디어 보관함만 삭제한다. 완료/범위를 확인하고 실패는 호출부에 전달한다.
 */
export async function withdrawMediaConsent() {
  const res = await fetch(`${SERVER_URL}/api/media-consent-withdraw`, {
    method: "POST",
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error(`withdraw failed: ${res.status}`);
  const result = await res.json();
  if (result.ok !== true || result.complete !== true || result.scope !== "authenticated_media_archive") {
    throw new Error("withdraw not confirmed");
  }
  return result;
}
