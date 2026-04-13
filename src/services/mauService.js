import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from "../utils/storage";

const SERVER_URL = "https://artlink-server.vercel.app";

export async function trackAppOpen(language, userType) {
  try {
    let deviceId = await safeStorageGet(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await safeStorageSet(STORAGE_KEYS.DEVICE_ID, deviceId);
    }

    await fetch(`${SERVER_URL}/api/track-mau`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        language: language || "en",
        userType: userType || "unknown",
        platform: "ios",
        appVersion: "1.10.2",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (_) {
    // Silent fail — tracking is best-effort
  }
}
