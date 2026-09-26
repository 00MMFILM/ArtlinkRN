import { initPurchases, checkPremium } from "../purchasesService";
import Purchases from "react-native-purchases";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("react-native-purchases", () => ({
  configure: jest.fn(),
  getAppUserID: jest.fn(),
  getCustomerInfo: jest.fn(),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  Purchases.getAppUserID.mockResolvedValue("A");
  Purchases.getCustomerInfo.mockResolvedValue({ entitlements: { active: { premium: {} } } });
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
