import { Platform } from "react-native";
import Purchases from "react-native-purchases";

// RevenueCat Public API Keys (공개 키 — 클라이언트 임베드가 정상 사용법)
// TODO(RC): Android 키는 Play Store 앱 등록(service account) 후 교체
const RC_API_KEY_IOS = "appl_MZBJMVgQlttdZdEhGxfYmpVppIN";
const RC_API_KEY_ANDROID = "RC_ANDROID_KEY_PLACEHOLDER";

// RevenueCat 대시보드의 Entitlement 식별자
export const ENTITLEMENT_ID = "premium";

function apiKey() {
  return Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
}

export function purchasesReady() {
  return !apiKey().includes("PLACEHOLDER");
}

let configured = false;

/** 앱 시작 시 1회 호출. authUserId 있으면 RevenueCat app_user_id로 사용 (웹훅 매칭 기준) */
export async function initPurchases(authUserId) {
  if (!purchasesReady() || configured) return;
  try {
    Purchases.configure({ apiKey: apiKey(), appUserID: authUserId || undefined });
    configured = true;
  } catch (e) {
    console.log("[purchases] configure failed:", e.message);
  }
}

/** 로그인/계정연결 시 호출 — 익명 구매를 Supabase 유저와 병합 */
export async function logInPurchases(authUserId) {
  if (!configured || !authUserId) return;
  try {
    await Purchases.logIn(authUserId);
  } catch (e) {
    console.log("[purchases] logIn failed:", e.message);
  }
}

/** 현재 오퍼링(월/연 패키지) 조회 */
export async function getPremiumOffering() {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current || null;
  } catch (e) {
    console.log("[purchases] getOfferings failed:", e.message);
    return null;
  }
}

/** 패키지 구매. 성공 시 true (서버 premium_members는 웹훅이 갱신) */
export async function purchasePremium(pkg) {
  if (!configured) return { success: false, cancelled: false };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    return { success: active, cancelled: false };
  } catch (e) {
    return { success: false, cancelled: !!e.userCancelled };
  }
}

/** 구매 복원 (앱스토어 심사 필수 요소) */
export async function restorePurchases() {
  if (!configured) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch (e) {
    console.log("[purchases] restore failed:", e.message);
    return false;
  }
}

/** 프리미엄 활성 여부 */
export async function checkPremium() {
  if (!configured) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}
