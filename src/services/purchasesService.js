import { Platform } from "react-native";
import Purchases from "react-native-purchases";

// RevenueCat Public API Keys (공개 키 — 클라이언트 임베드가 정상 사용법)
const RC_API_KEY_IOS = "appl_MZBJMVgQlttdZdEhGxfYmpVppIN";
const RC_API_KEY_ANDROID = "goog_uagvXcHGyCpxcaSKdMcDacratqJ";

// RevenueCat 대시보드의 Entitlement 식별자
export const ENTITLEMENT_ID = "premium";

function apiKey() {
  return Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
}

export function purchasesReady() {
  return !apiKey().includes("PLACEHOLDER");
}

let configured = false;

// A foreground login must not switch the SDK account while a store sheet is
// buying/restoring a receipt. All identity-changing operations share this queue.
let identityOperations = Promise.resolve();
function serializeIdentity(operation) {
  const run = identityOperations.then(operation, operation);
  identityOperations = run.catch(() => {});
  return run;
}

async function linkAccount(authUserId) {
  if (!configured || typeof authUserId !== "string" || !authUserId.trim()) return false;
  try {
    await Purchases.logIn(authUserId);
    return await Purchases.getAppUserID() === authUserId;
  } catch {
    return false;
  }
}

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
  return serializeIdentity(() => linkAccount(authUserId));
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

// Verify the app owner again after every await before a transaction starts.
// The caller's isCurrent guard also prevents stale results from changing UI.
function storeTransaction(operation, { authUserId, isCurrent = () => true } = {}) {
  return serializeIdentity(async () => {
    const failed = (reason, cancelled = false) => ({ success: false, cancelled, reason });
    if (typeof authUserId !== "string" || !authUserId.trim()) return failed("login_required");
    if (!configured) return failed("not_configured");
    if (!isCurrent()) return failed("account_changed");
    try {
      const sdkId = await Purchases.getAppUserID();
      if (!isCurrent()) return failed("account_changed");
      if (sdkId !== authUserId) {
        const linked = await linkAccount(authUserId);
        if (!isCurrent()) return failed("account_changed");
        if (!linked) return failed("account_link_failed");
      }
    } catch {
      return failed("account_link_failed");
    }
    try {
      const customerInfo = await operation();
      if (!isCurrent()) return failed("account_changed");
      const sdkId = await Purchases.getAppUserID();
      if (!isCurrent()) return failed("account_changed");
      if (sdkId !== authUserId) return failed("account_link_failed");
      const active = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
      return active ? { success: true, cancelled: false } : failed("no_entitlement");
    } catch (e) {
      return failed(isCurrent() ? "store_error" : "account_changed", !!e?.userCancelled);
    }
  });
}

/** 구매는 앱 계정을 확정한 뒤 그 SDK 계정에 묶어서 실행한다. */
export function purchasePremium(pkg, owner) {
  return storeTransaction(async () => (await Purchases.purchasePackage(pkg)).customerInfo, owner);
}

/** 복원 버튼은 유지하되 앱 로그인 후 해당 계정으로만 복원한다. */
export function restorePurchases(owner) {
  return storeTransaction(() => Purchases.restorePurchases(), owner);
}

/** 프리미엄 엔티틀먼트 상세 (만료일·상품 식별자). 없으면 null */
export async function getPremiumEntitlement(expectedAuthUserId) {
  if (!configured || !expectedAuthUserId) return null;
  try {
    if (await Purchases.getAppUserID() !== expectedAuthUserId) return null;
    const customerInfo = await Purchases.getCustomerInfo();
    if (await Purchases.getAppUserID() !== expectedAuthUserId) return null;
    return customerInfo.entitlements.active[ENTITLEMENT_ID] || null;
  } catch {
    return null;
  }
}

/** 프리미엄 활성 여부 */
export async function checkPremium(expectedAuthUserId) {
  if (!configured) return false;
  try {
    // SDK login is asynchronous. A fresh app account must not reuse the previous
    // SDK user's receipt while AppNavigator is still linking the new identity.
    if (expectedAuthUserId && await Purchases.getAppUserID() !== expectedAuthUserId) return false;
    const customerInfo = await Purchases.getCustomerInfo();
    if (expectedAuthUserId && await Purchases.getAppUserID() !== expectedAuthUserId) return false;
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}
