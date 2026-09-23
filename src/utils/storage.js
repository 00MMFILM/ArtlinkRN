import AsyncStorage from "@react-native-async-storage/async-storage";
import { scopedKey } from "./accountStorage";

// Use for account hydration: a failed read is not an empty account.
export const strictStorageGet = async (key, scope) => {
  const value = await AsyncStorage.getItem(scopedKey(key, scope));
  return value === null ? null : JSON.parse(value);
};

export const safeStorageGet = async (key, scope) => {
  try {
    const value = await AsyncStorage.getItem(scopedKey(key, scope));
    return value ? JSON.parse(value) : null;
  } catch (e) {
    return null;
  }
};

export const safeStorageSet = async (key, value, scope) => {
  try {
    await AsyncStorage.setItem(scopedKey(key, scope), JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
};

export const STORAGE_KEYS = {
  NOTES: "artlink-notes",
  NOTE_STATE: "artlink-note-state-v1",
  PROFILE: "artlink-profile",
  DARK_MODE: "artlink-darkmode",
  GOALS: "artlink-goals",
  FEEDBACKS: "artlink-feedbacks",
  BETA_GUIDE: "artlink-beta-guide-dismissed",
  COMMUNITY_POSTS: "artlink-community-posts",
  PORTFOLIO_ID: "artlink-public-portfolio-id",
  PORTFOLIO_ITEMS: "artlink-portfolio-items",
  PORTFOLIO_SUMMARY: "artlink-portfolio-summary",
  MATCHING_POSTS: "artlink-matching-posts",
  MATCHING_DELETED: "artlink-matching-deleted",
  EULA_ACCEPTED: "artlink-eula-accepted",
  BLOCKED_USERS: "artlink-blocked-users",
  REPORTED_CONTENT: "artlink-reported-content",
  DEVICE_ID: "artlink-device-id",
  DEVICE_USER_ID: "artlink-device-user-id",
  PROFILE_TOKEN: "artlink-profile-token",
  DATA_CONSENT: "artlink-data-consent",
  DATA_CONSENT_ASKED: "artlink-data-consent-asked",
  LANGUAGE: "artlink-language",
  AI_DISCLOSURE_ACCEPTED: "artlink-ai-disclosure-accepted",
};
