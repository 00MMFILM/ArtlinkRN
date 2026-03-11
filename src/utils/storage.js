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
  SUBSCRIPTION: "artlink-subscription",
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
};
