import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

const AD_UNITS = {
  INTERSTITIAL: __DEV__
    ? TestIds.INTERSTITIAL
    : Platform.select({
        ios: "ca-app-pub-4155982682875139/8204882550",
        android: "ca-app-pub-4155982682875139/3847784236",
      }),
  REWARDED: __DEV__
    ? TestIds.REWARDED
    : Platform.select({
        ios: "ca-app-pub-4155982682875139/4537100280",
        android: "ca-app-pub-4155982682875139/6793806923",
      }),
  BANNER: __DEV__
    ? TestIds.ADAPTIVE_BANNER
    : Platform.select({
        ios: "ca-app-pub-4155982682875139/6379284707",
        android: "ca-app-pub-4155982682875139/8582407029",
      }),
};

const STORAGE_KEY = "artlink-daily-ai";

// ─── Daily AI Count ───

export async function getDailyAICount() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: "", count: 0 };
    const data = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return { date: today, count: 0 };
    return data;
  } catch {
    return { date: "", count: 0 };
  }
}

export async function incrementDailyAICount() {
  const today = new Date().toISOString().slice(0, 10);
  const current = await getDailyAICount();
  const newCount = current.date === today ? current.count + 1 : 1;
  const data = { date: today, count: newCount };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return newCount;
}

export function shouldShowInterstitial(isKoreanLocale, count) {
  return !isKoreanLocale && count >= 2;
}

// ─── Interstitial Ad ───

const AD_TIMEOUT_MS = 20000;

export function showInterstitialAd() {
  return new Promise((resolve) => {
    const ad = InterstitialAd.createForAdRequest(AD_UNITS.INTERSTITIAL);

    const timeoutId = setTimeout(() => {
      unsubLoaded();
      unsubClosed();
      unsubError();
      resolve(false);
    }, AD_TIMEOUT_MS);

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      ad.show();
    });

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      clearTimeout(timeoutId);
      unsubLoaded();
      unsubClosed();
      unsubError();
      resolve(true);
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      clearTimeout(timeoutId);
      unsubLoaded();
      unsubClosed();
      unsubError();
      resolve(false);
    });

    ad.load();
  });
}

// ─── Rewarded Ad ───
const REWARDED_WATCHDOG_MS = 5 * 60 * 1000;

export function showRewardedAd() {
  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(AD_UNITS.REWARDED);
    let rewarded = false;
    let watchdogId = null;
    const finish = (value) => {
      clearTimeout(timeoutId);
      clearTimeout(watchdogId);
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      resolve(value);
    };

    const timeoutId = setTimeout(() => finish(false), AD_TIMEOUT_MS);

    const unsubLoaded = ad.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        // 로드까지만 20초 제한 — 시청 자체는 20초를 넘어도 실패 처리하면 안 된다.
        // 대신 SDK가 닫힘·오류를 끝내 안 알려줄 때 영원히 멈추지 않게 5분 안전망을 둔다.
        clearTimeout(timeoutId);
        watchdogId = setTimeout(() => finish(rewarded), REWARDED_WATCHDOG_MS);
        try {
          ad.show();
        } catch {
          finish(false);
        }
      }
    );

    const unsubEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        rewarded = true;
      }
    );

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => finish(rewarded));
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => finish(false));

    ad.load();
  });
}

// ─── Banner Ad Unit ID (for component usage) ───

export { AD_UNITS };
