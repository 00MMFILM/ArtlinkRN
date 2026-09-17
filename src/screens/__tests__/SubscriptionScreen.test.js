import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import SubscriptionScreen from "../SubscriptionScreen";
import { useApp } from "../../context/AppContext";
import { getPremiumEntitlement } from "../../services/purchasesService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k) }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/purchasesService", () => ({
  purchasesReady: jest.fn(() => true),
  getPremiumOffering: jest.fn(async () => null),
  purchasePremium: jest.fn(),
  restorePurchases: jest.fn(),
  getPremiumEntitlement: jest.fn(async () => null),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const ctx = (premium) => ({ premium, markPremiumActive: jest.fn(), refreshPremium: jest.fn() });

describe("SubscriptionScreen — 비구독자", () => {
  beforeEach(() => jest.clearAllMocks());

  it("결제창(플랜 카드·구독 시작하기·가격 고지)을 보여준다", async () => {
    useApp.mockReturnValue(ctx({ active: false, kind: null, plan: null, since: null }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.cta_subscribe")).toBeTruthy());
    expect(queryByText("premium.monthly")).toBeTruthy();
    expect(queryByText("premium.yearly")).toBeTruthy();
    expect(queryByText("premium.active_title")).toBeNull();
  });
});

describe("SubscriptionScreen — 구독 중 (결제했는데 결제창이 또 뜨던 버그)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("결제 버튼·플랜 카드 대신 프리미엄 상태 화면을 보여준다", async () => {
    useApp.mockReturnValue(ctx({ active: true, kind: "sub", plan: "yearly", since: "2026-09-01T00:00:00.000Z" }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.active_title")).toBeTruthy());
    expect(queryByText("premium.cta_subscribe")).toBeNull();
    expect(queryByText("premium.monthly")).toBeNull();
    expect(queryByText("premium.yearly")).toBeNull();
    // 상태 화면 필수 요소: 플랜·시작일·구독 관리·구매 복원
    expect(queryByText("premium.active_plan_yearly")).toBeTruthy();
    expect(queryByText("premium.manage")).toBeTruthy();
    expect(queryByText("premium.restore")).toBeTruthy();
    expect(queryByText(/^premium\.since:/)).toBeTruthy();
  });

  it("무료 이용권(comp)이면 무료 이용권 문구를 쓰고 다음 결제일은 없다", async () => {
    useApp.mockReturnValue(ctx({ active: true, kind: "comp", plan: null, since: null }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.active_title")).toBeTruthy());
    expect(queryByText("premium.active_plan_comp")).toBeTruthy();
    expect(queryByText(/^premium\.next_billing/)).toBeNull();
  });

  it("RevenueCat 만료일이 있으면 다음 결제일로 표시한다", async () => {
    getPremiumEntitlement.mockResolvedValue({
      expirationDate: "2027-09-01T00:00:00Z",
      productIdentifier: "artlink_premium_yearly",
    });
    useApp.mockReturnValue(ctx({ active: true, kind: "sub", plan: "yearly", since: "2026-09-01T00:00:00.000Z" }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText(/^premium\.next_billing/)).toBeTruthy());
  });
});
