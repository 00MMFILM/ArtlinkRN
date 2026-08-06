import { Platform } from "react-native";
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from "../utils/storage";
import { SERVER_URL, getApiHeaders } from "./apiConfig";

const APP_VERSION = require("../../app.json").expo.version;

export async function getOrCreateDeviceId() {
  let deviceId = await safeStorageGet(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await safeStorageSet(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

export async function trackAppOpen(language, userType) {
  try {
    const deviceId = await getOrCreateDeviceId();

    await fetch(`${SERVER_URL}/api/track-mau`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        deviceId,
        language: language || "en",
        userType: userType || "unknown",
        platform: Platform.OS,
        appVersion: APP_VERSION,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (_) {
    // Silent fail — tracking is best-effort
  }
}

/**
 * 온보딩 퍼널 이벤트 기록 (기기당 이벤트별 최초 1회만 서버에 저장됨)
 * events: new_open, onboarding_completed, auth_reached, signup_completed,
 *         login_completed, browse_skipped, eula_accepted, profile_registered
 */
export async function trackFunnelEvent(event, language) {
  try {
    const deviceId = await getOrCreateDeviceId();

    await fetch(`${SERVER_URL}/api/track-event`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        deviceId,
        event,
        language: language || "en",
        platform: Platform.OS,
        appVersion: APP_VERSION,
      }),
    });
  } catch (_) {
    // Silent fail — tracking is best-effort
  }
}
