import * as VideoThumbnails from "expo-video-thumbnails";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Extract evenly-spaced frames from a video, resize to maxWidth, return as base64 JPEG.
 * @param {string} videoUri - local file URI
 * @param {number} durationSec - video duration in seconds
 * @param {number} [frameCount] - auto-selected if omitted: 길이 비례 (~15초당 1장, 4~16장)
 * @param {number} [maxWidth=512] - resize width (aspect ratio kept)
 * @returns {Promise<{frames: string[], times: number[]}>} base64 JPEG 배열 + 각 프레임의 시각(초)
 */
export async function extractVideoFrames(videoUri, durationSec, frameCount, maxWidth = 512) {
  if (!frameCount) {
    // 길이 비례 샘플링: 기존 고정 7장은 5분 영상에서 43초당 1장 꼴 — 분석 밀도 붕괴
    if (durationSec < 30) frameCount = 4;
    else frameCount = Math.min(16, Math.max(6, Math.round(durationSec / 15)));
  }

  const durationMs = (durationSec || 10) * 1000;
  const interval = durationMs / (frameCount + 1);

  const frames = [];
  const times = []; // 각 프레임의 영상 내 시각(초) — 서버가 타임스탬프 라벨로 사용

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
        times.push(Math.round(timeMs / 1000));
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

  return { frames, times };
}
