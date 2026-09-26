import { initPurchases, checkPremium, logInPurchases, purchasePremium, restorePurchases, getPremiumEntitlement } from "../purchasesService";
import Purchases from "react-native-purchases";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("react-native-purchases", () => ({
  configure: jest.fn(),
  getAppUserID: jest.fn(),
  getCustomerInfo: jest.fn(),
  logIn: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
}));

let sdkId;
const info = () => ({ entitlements: { active: { premium: { productIdentifier: "test-monthly" } } } });
const pkg = { identifier: "test-package" };
const settle = () => new Promise(resolve => setImmediate(resolve));
beforeEach(async () => {
  jest.resetAllMocks();
  sdkId = "A";
  Purchases.getAppUserID.mockImplementation(async () => sdkId);
  Purchases.getCustomerInfo.mockResolvedValue(info());
  Purchases.logIn.mockImplementation(async (id) => { sdkId = id; return { customerInfo: info() }; });
  Purchases.purchasePackage.mockResolvedValue({ customerInfo: info() });
  Purchases.restorePurchases.mockResolvedValue(info());
  await initPurchases("A");
});

test("B 로그인 연결 중 남아 있는 A 영수증은 B 프리미엄으로 적용하지 않는다", async () => {
  expect(await checkPremium("B")).toBe(false);
  expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
});

test("같은 계정으로 확인한 활성 영수증은 프리미엄으로 인정한다", async () => {
  expect(await checkPremium("A")).toBe(true);
  expect(Purchases.getAppUserID).toHaveBeenCalledTimes(2);
});

test("영수증 조회 중 SDK 계정이 바뀌면 조회 결과를 버린다", async () => {
  let resolveInfo;
  Purchases.getCustomerInfo.mockImplementation(() => new Promise((resolve) => { resolveInfo = resolve; }));
  const request = checkPremium("A");
  await Promise.resolve();
  Purchases.getAppUserID.mockResolvedValue("B");
  resolveInfo({ entitlements: { active: { premium: {} } } });
  expect(await request).toBe(false);
});

test("SDK 로그인 실패는 호출자에게 false로 전달한다", async () => {
  Purchases.logIn.mockRejectedValueOnce(new Error("offline"));
  expect(await logInPurchases("B")).toBe(false);
});

test("계정 연결에 실패하면 스토어 구매창을 열지 않는다", async () => {
  Purchases.logIn.mockRejectedValueOnce(new Error("offline"));
  expect(await purchasePremium(pkg, { authUserId: "B" })).toMatchObject({ success: false, reason: "account_link_failed" });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

test("SDK 로그인 성공 응답만 믿지 않고 실제 ID를 확인한다", async () => {
  Purchases.logIn.mockResolvedValueOnce({ customerInfo: info() }); // SDK still A
  expect(await purchasePremium(pkg, { authUserId: "B" })).toMatchObject({ success: false, reason: "account_link_failed" });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

test("계정 연결 대기 중 앱 계정이 바뀌면 결제를 시작하지 않는다", async () => {
  let finishLogin, current = true;
  Purchases.logIn.mockImplementationOnce(() => new Promise(resolve => { finishLogin = resolve; }));
  const request = purchasePremium(pkg, { authUserId: "B", isCurrent: () => current });
  await settle();
  current = false; sdkId = "B"; finishLogin({ customerInfo: info() });
  expect(await request).toMatchObject({ success: false, reason: "account_changed" });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
});

test("확인된 현재 계정으로만 구매하고 그 계정에 결과를 반환한다", async () => {
  expect(await purchasePremium(pkg, { authUserId: "B" })).toMatchObject({ success: true });
  expect(Purchases.logIn).toHaveBeenCalledWith("B");
  expect(Purchases.purchasePackage).toHaveBeenCalledWith(pkg);
  expect(sdkId).toBe("B");
});

test("계정 없는 구매·복원은 스토어 호출 없이 거부한다", async () => {
  expect(await purchasePremium(pkg)).toMatchObject({ success: false, reason: "login_required" });
  expect(await restorePurchases()).toMatchObject({ success: false, reason: "login_required" });
  expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  expect(Purchases.restorePurchases).not.toHaveBeenCalled();
});

test("복원 전에도 앱 계정을 연결해 이전 계정으로 복원하지 않는다", async () => {
  expect(await restorePurchases({ authUserId: "B" })).toMatchObject({ success: true });
  expect(Purchases.logIn).toHaveBeenCalledWith("B");
  expect(Purchases.restorePurchases).toHaveBeenCalledTimes(1);
  expect(sdkId).toBe("B");
});

test("복원 API 장애를 구매 내역 없음으로 안내하지 않는다", async () => {
  Purchases.restorePurchases.mockRejectedValueOnce(new Error("offline"));
  expect(await restorePurchases({ authUserId: "A" })).toMatchObject({ success: false, reason: "store_error" });
});

test("확인된 복원 내역이 없을 때만 no_entitlement로 반환한다", async () => {
  Purchases.restorePurchases.mockResolvedValueOnce({ entitlements: { active: {} } });
  expect(await restorePurchases({ authUserId: "A" })).toMatchObject({ success: false, reason: "no_entitlement" });
});

test("스토어 구매가 진행되는 동안 다른 SDK 로그인이 끼어들지 않는다", async () => {
  let finishPurchase, current = true;
  Purchases.purchasePackage.mockImplementationOnce(() => new Promise(resolve => { finishPurchase = resolve; }));
  const request = purchasePremium(pkg, { authUserId: "A", isCurrent: () => current });
  await settle();
  current = false;
  const login = logInPurchases("B");
  await settle();
  expect(Purchases.logIn).not.toHaveBeenCalledWith("B");
  finishPurchase({ customerInfo: info() });
  expect(await request).toMatchObject({ success: false, reason: "account_changed" });
  expect(await login).toBe(true);
  expect(sdkId).toBe("B");
});

test("다른 계정 영수증의 상품·만료일을 읽지 않는다", async () => {
  expect(await getPremiumEntitlement("B")).toBeNull();
  expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
});

test("사용자가 구매창을 취소한 경우는 일반 장애와 구분한다", async () => {
  Purchases.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
  expect(await purchasePremium(pkg, { authUserId: "A" })).toMatchObject({ success: false, cancelled: true });
});
