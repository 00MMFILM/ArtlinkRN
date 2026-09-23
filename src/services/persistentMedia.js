import * as FileSystem from "expo-file-system/legacy";
import { createMediaId } from "./mediaFileId";

// Keep a private app copy before a picker/cache URI is referenced by saved content.
// Copy failures are propagated: callers must keep the editor open and never claim a save.
// We deliberately do not delete the source or older files here.
export async function preserveMediaFile(uri, fallbackExtension = "jpg") {
  if (typeof uri !== "string" || !uri) throw new Error("MEDIA_URI_REQUIRED");
  if (/^https?:\/\//i.test(uri)) return uri;
  const documents = FileSystem.documentDirectory;
  if (!documents) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  if (uri.startsWith(documents)) {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) throw new Error("MEDIA_FILE_MISSING");
    return uri;
  }
  const dir = documents + "media/";
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const extension = uri.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() || fallbackExtension;
  const target = `${dir}${createMediaId()}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  const copied = await FileSystem.getInfoAsync(target);
  if (!copied.exists) throw new Error("MEDIA_COPY_FAILED");
  return target;
}
