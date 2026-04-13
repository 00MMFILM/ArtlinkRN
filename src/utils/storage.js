import AsyncStorage from "@react-native-async-storage/async-storage";

export const safeStorageGet = async (key) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    return null;
  }
};

export const safeStorageSet = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
};

export const STORAGE_KEYS = {
  NOTES: "artlink-notes",
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
  EULA_ACCEPTED: "artlink-eula-accepted",
  BLOCKED_USERS: "artlink-blocked-users",
  REPORTED_CONTENT: "artlink-reported-content",
  DEVICE_ID: "artlink-device-id",
  DEVICE_USER_ID: "artlink-device-user-id",
  DATA_CONSENT: "artlink-data-consent",
  DATA_CONSENT_ASKED: "artlink-data-consent-asked",
  LANGUAGE: "artlink-language",
  AI_DISCLOSURE_ACCEPTED: "artlink-ai-disclosure-accepted",
};
