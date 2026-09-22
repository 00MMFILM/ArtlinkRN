// 1.11.6 이전 녹음은 캐시 폴더 uri 그대로 노트에 저장됐다(OS가 캐시를 비우면 사라짐).
// 앱 시작 시 한 번, 아직 남아 있는 캐시 녹음을 문서 폴더로 옮기고 노트의 uri를 바꾼다.
import * as FileSystem from "expo-file-system/legacy";

/** 옮길 녹음이 있는 노트만 새 uri로 바꾼 사본을 돌려준다. 바뀐 게 없으면 null. */
export async function migrateCachedRecordings(notes, fs = FileSystem) {
  const cacheDir = fs.cacheDirectory;
  if (!cacheDir || !Array.isArray(notes)) return null;
  const targets = notes.filter((n) => (n.voiceRecordings || []).some((v) => typeof v?.uri === "string" && v.uri.startsWith(cacheDir)));
  if (targets.length === 0) return null;

  const mediaDir = fs.documentDirectory + "media/";
  try {
    const info = await fs.getInfoAsync(mediaDir);
    if (!info.exists) await fs.makeDirectoryAsync(mediaDir, { intermediates: true });
  } catch {
    return null;
  }

  let changed = false;
  const moved = new Map(); // noteId → 새 voiceRecordings
  for (const note of targets) {
    const next = [];
    for (const v of note.voiceRecordings) {
      if (typeof v?.uri !== "string" || !v.uri.startsWith(cacheDir)) { next.push(v); continue; }
      try {
        const exists = (await fs.getInfoAsync(v.uri)).exists;
        if (!exists) { next.push(v); continue; } // 이미 사라진 파일은 건드리지 않는다(되살릴 수 없음)
        const ext = (v.uri.split(".").pop() || "m4a").split("?")[0];
        const dest = `${mediaDir}${note.id}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await fs.copyAsync({ from: v.uri, to: dest });
        next.push({ ...v, uri: dest });
        changed = true;
      } catch {
        next.push(v);
      }
    }
    moved.set(note.id, next);
  }
  if (!changed) return null;
  return notes.map((n) => (moved.has(n.id) ? { ...n, voiceRecordings: moved.get(n.id) } : n));
}
