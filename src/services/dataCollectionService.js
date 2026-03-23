import { supabase } from "./supabaseClient";

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

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
