import { supabase } from "./supabaseClient";

/**
 * 로컬 노트 배열을 서버에 upsert (auth_user_id + local_id 기준)
 * 미디어(images, voiceRecordings, audioFiles, pdfFiles)는 로컬 URI라 제외
 */
export async function syncNotesToServer(authUserId, notes) {
  if (!authUserId || !notes?.length) return;

  const rows = notes.map((n) => ({
    auth_user_id: authUserId,
    local_id: n.id,
    title: n.title || "",
    content: n.content || "",
    field: n.field || null,
    tags: n.tags || [],
    series_name: n.seriesName || null,
    starred: !!n.starred,
    ai_comment: n.aiComment || null,
    ai_scores: n.aiScores || null,
    video_analysis: n.videoAnalysis || null,
    created_at: n.createdAt,
    updated_at: n.updatedAt || n.createdAt,
    deleted: false,
  }));

  const { error } = await supabase
    .from("user_notes")
    .upsert(rows, { onConflict: "auth_user_id,local_id" });

  if (error) throw error;
}

/**
 * 단일 노트를 서버에 upsert
 */
export async function syncSingleNote(authUserId, note) {
  if (!authUserId) return;

  const { error } = await supabase
    .from("user_notes")
    .upsert({
      auth_user_id: authUserId,
      local_id: note.id,
      title: note.title || "",
      content: note.content || "",
      field: note.field || null,
      tags: note.tags || [],
      series_name: note.seriesName || null,
      starred: !!note.starred,
      ai_comment: note.aiComment || null,
      ai_scores: note.aiScores || null,
      video_analysis: note.videoAnalysis || null,
      created_at: note.createdAt,
      updated_at: note.updatedAt || new Date().toISOString(),
      deleted: false,
    }, { onConflict: "auth_user_id,local_id" });

  if (error) throw error;
}

/**
 * 서버에서 유저의 모든 노트 가져오기 (deleted=false)
 */
export async function fetchNotesFromServer(authUserId) {
  if (!authUserId) return [];

  const { data, error } = await supabase
    .from("user_notes")
    .select("*")
    .eq("auth_user_id", authUserId)
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * 서버 노트를 로컬 형태로 변환
 */
function serverNoteToLocal(sn) {
  return {
    id: sn.local_id,
    title: sn.title,
    content: sn.content,
    field: sn.field || undefined,
    tags: sn.tags || [],
    seriesName: sn.series_name || undefined,
    starred: !!sn.starred,
    aiComment: sn.ai_comment || undefined,
    aiScores: sn.ai_scores || undefined,
    videoAnalysis: sn.video_analysis || undefined,
    createdAt: sn.created_at,
    updatedAt: sn.updated_at,
  };
}

/**
 * 서버 노트와 로컬 노트를 merge
 * - updated_at 기준 최신 우선
 * - 로컬에 없는 서버 노트는 추가 (다른 기기에서 작성한 노트 복원)
 * - 서버에 없는 로컬 노트는 유지 (아직 sync 안 된 노트)
 */
export function mergeNotes(localNotes, serverRows) {
  const localMap = new Map(localNotes.map((n) => [n.id, n]));
  const merged = [...localNotes];

  for (const sn of serverRows) {
    const localNote = localMap.get(sn.local_id);
    if (localNote) {
      // 둘 다 존재: updated_at 비교하여 최신 우선
      const localTime = new Date(localNote.updatedAt || localNote.createdAt).getTime();
      const serverTime = new Date(sn.updated_at).getTime();
      if (serverTime > localTime) {
        // 서버가 더 최신 → 서버 데이터로 교체 (로컬 미디어는 유지)
        const idx = merged.findIndex((n) => n.id === sn.local_id);
        merged[idx] = {
          ...serverNoteToLocal(sn),
          // 로컬 미디어 필드 유지
          images: localNote.images,
          voiceRecordings: localNote.voiceRecordings,
          audioFiles: localNote.audioFiles,
          pdfFiles: localNote.pdfFiles,
        };
      }
    } else {
      // 로컬에 없음 → 서버에서 복원 (다른 기기 노트)
      merged.push(serverNoteToLocal(sn));
    }
  }

  // createdAt 기준 내림차순 정렬
  merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return merged;
}

/**
 * 노트 soft delete (서버에서 deleted=true 처리)
 */
export async function deleteNoteFromServer(authUserId, localId) {
  if (!authUserId) return;

  const { error } = await supabase
    .from("user_notes")
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq("auth_user_id", authUserId)
    .eq("local_id", localId);

  if (error) throw error;
}
