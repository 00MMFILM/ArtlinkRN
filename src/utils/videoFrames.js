import * as VideoThumbnails from "expo-video-thumbnails";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Extract evenly-spaced frames from a video, resize to maxWidth, return as base64 JPEG.
 * @param {string} videoUri - local file URI
 * @param {number} durationSec - video duration in seconds
 * @param {number} [frameCount] - auto-selected if omitted: <30s=3, 30-59s=5, 60s+=7
 * @param {number} [maxWidth=512] - resize width (aspect ratio kept)
 * @returns {Promise<string[]>} array of base64-encoded JPEG strings (no data: prefix)
 */
export async function extractVideoFrames(videoUri, durationSec, frameCount, maxWidth = 512) {
  if (!frameCount) {
    if (durationSec < 30) frameCount = 3;
    else if (durationSec < 60) frameCount = 5;
    else frameCount = 7;
  }

  const durationMs = (durationSec || 10) * 1000;
  const interval = durationMs / (frameCount + 1);

  const frames = [];

  for (let i = 1; i <= frameCount; i++) {
    const timeMs = Math.round(interval * i);
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: timeMs,
      });

      const manipulated = await manipulateAsync(
        thumbUri,
        [{ resize: { width: maxWidth } }],
        { format: SaveFormat.JPEG, compress: 0.6, base64: true }
      );

      if (manipulated.base64) {
        frames.push(manipulated.base64);
      }

      // Clean up thumbnail temp file
      try {
        await FileSystem.deleteAsync(thumbUri, { idempotent: true });
      } catch {}
    } catch (e) {
      console.log(`[videoFrames] Frame ${i} at ${timeMs}ms failed:`, e.message);
      // Skip failed frame and continue
    }
  }

  return frames;
}
