import { supabase } from "./supabaseClient";
import { safeStorageGet, STORAGE_KEYS } from "../utils/storage";

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Submit AI analysis data for training (consented users — includes full content).
 */
export async function submitTrainingData({ field, noteContent, aiFeedback, noteTitle }) {
  const contentHash = simpleHash(noteContent + aiFeedback);

  const { data: existing } = await supabase
    .from("training_data")
    .select("id")
    .eq("content_hash", contentHash)
    .limit(1);

  if (existing && existing.length > 0) return;

  const { error } = await supabase
    .from("training_data")
    .insert({
      field,
      content_hash: contentHash,
      note_content: noteContent,
      ai_feedback: aiFeedback,
      note_title: noteTitle || null,
    });

  if (error) console.log("[dataCollection] Error:", error.message);
}

/**
 * Submit anonymous AI analysis metadata for ALL users (including guests).
 * Does NOT include full note content — only metadata for pattern learning.
 */
export async function submitAnonymousMetadata({ field, noteTitle, aiFeedback, tags, userType }) {
  try {
    const deviceId = await safeStorageGet(STORAGE_KEYS.DEVICE_ID);
    const feedbackLength = (aiFeedback || "").length;
    // Extract only the section headers/scores from AI feedback (no personal content)
    const feedbackSections = (aiFeedback || "")
      .split("\n")
      .filter((line) => /^[📌💪🎯🎭🎨💡📈🔜🎤]/.test(line.trim()))
      .map((line) => line.trim().slice(0, 50))
      .join("; ");

    await supabase.from("anonymous_ai_metadata").insert({
      device_id: deviceId || "unknown",
      field: field || "etc",
      note_title_hash: noteTitle ? simpleHash(noteTitle) : null,
      feedback_length: feedbackLength,
      feedback_sections: feedbackSections || null,
      tags: tags || [],
      user_type: userType || "unknown",
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Silent fail — anonymous tracking is best-effort
  }
}
