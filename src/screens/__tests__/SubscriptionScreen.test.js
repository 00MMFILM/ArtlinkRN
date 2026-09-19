import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { Alert, Platform } from "react-native";
import SubscriptionScreen from "../SubscriptionScreen";
import { useApp } from "../../context/AppContext";
import {
  getPremiumEntitlement,
  getPremiumOffering,
  purchasePremium,
  restorePurchases,
} from "../../services/purchasesService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k) }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/purchasesService", () => ({
  purchasesReady: jest.fn(() => true),
  getPremiumOffering: jest.fn(async () => null),
  purchasePremium: jest.fn(async () => ({ success: true, cancelled: false })),
  restorePurchases: jest.fn(async () => true),
  getPremiumEntitlement: jest.fn(async () => null),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

// 기본은 로그인된 유저 — 게스트 결제 방지 테스트는 userProfile을 따로 넘긴다
const ctx = (premium, userProfile = { authUserId: "u1" }) => ({
  premium,
  markPremiumActive: jest.fn(),
  refreshPremium: jest.fn(),
  userProfile,
  setAuthState: jest.fn(),
});

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

// 버그: 비로그인 상태에서 구독하면 RevenueCat 익명 ID라 서버 웹훅이 무시해 프리미엄이 안 켜졌다(2026-09)
describe("SubscriptionScreen — 게스트 결제 방지", () => {
  beforeEach(() => jest.clearAllMocks());

  it("비로그인 상태에서 구독 버튼을 누르면 결제 대신 로그인 안내가 뜨고 결제는 진행되지 않는다", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const guestCtx = ctx({ active: false, kind: null, plan: null, since: null }, {});
    useApp.mockReturnValue(guestCtx);
    const { getByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(getByText("premium.cta_subscribe")).toBeTruthy());

    fireEvent.press(getByText("premium.cta_subscribe"));

    expect(alertSpy).toHaveBeenCalledWith(
      "premium.login_required_title",
      "premium.login_required_message",
      expect.any(Array)
    );
    expect(purchasePremium).not.toHaveBeenCalled();

    // 안내에서 확인을 누르면 기존 로그인/가입 이동 방식(setAuthState)으로 보낸다
    const buttons = alertSpy.mock.calls[0][2];
    buttons.find((b) => b.text === "common.confirm").onPress();
    expect(guestCtx.setAuthState).toHaveBeenCalledWith("auth");

    alertSpy.mockRestore();
  });

  it("비로그인 상태에서도 구매 복원은 막지 않는다 (재설치 사용자·스토어 심사)", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const guestCtx = ctx({ active: false, kind: null, plan: null, since: null }, {});
    useApp.mockReturnValue(guestCtx);
    const { getByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(getByText("premium.restore")).toBeTruthy());

    fireEvent.press(getByText("premium.restore"));

    await waitFor(() => expect(restorePurchases).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls.some((c) => c[0] === "premium.login_required_title")).toBe(false);

    alertSpy.mockRestore();
  });

  it("로그인 상태면 안내 없이 정상 구매가 진행된다", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    getPremiumOffering.mockResolvedValueOnce({
      annual: { product: { priceString: "₩49,000" } },
      monthly: { product: { priceString: "₩6,900" } },
    });
    useApp.mockReturnValue(ctx({ active: false, kind: null, plan: null, since: null })); // authUserId 있음
    const { getByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(getByText("premium.cta_subscribe")).toBeTruthy());

    fireEvent.press(getByText("premium.cta_subscribe"));

    await waitFor(() => expect(purchasePremium).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalledWith(
      "premium.login_required_title",
      expect.anything(),
      expect.anything()
    );

    alertSpy.mockRestore();
  });
});

// 버그: 자동갱신 안내가 안드로이드에서도 "App Store 설정"으로 나왔다(2026-09-19)
describe("SubscriptionScreen — 자동갱신 안내 플랫폼 분기", () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });
  beforeEach(() => jest.clearAllMocks());

  it("안드로이드는 premium.renew_notice_android 키를 쓴다", async () => {
    Platform.OS = "android";
    useApp.mockReturnValue(ctx({ active: false, kind: null, plan: null, since: null }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.cta_subscribe")).toBeTruthy());
    expect(queryByText(/^premium\.renew_notice_android:/)).toBeTruthy();
    expect(queryByText(/^premium\.renew_notice:/)).toBeNull();
  });

  it("iOS는 기존 premium.renew_notice 키를 쓴다", async () => {
    Platform.OS = "ios";
    useApp.mockReturnValue(ctx({ active: false, kind: null, plan: null, since: null }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.cta_subscribe")).toBeTruthy());
    expect(queryByText(/^premium\.renew_notice:/)).toBeTruthy();
    expect(queryByText(/^premium\.renew_notice_android:/)).toBeNull();
  });
});
