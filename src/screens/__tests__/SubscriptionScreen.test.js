import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
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
let mockScope = "account:u1";
jest.mock("../../utils/accountStorage", () => ({ getStorageScope: () => mockScope }));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/purchasesService", () => ({
  purchasesReady: jest.fn(() => true),
  getPremiumOffering: jest.fn(async () => null),
  purchasePremium: jest.fn(async () => ({ success: true, cancelled: false })),
  restorePurchases: jest.fn(async () => ({ success: true })),
  getPremiumEntitlement: jest.fn(async () => null),
  logInPurchases: jest.fn(async () => {}),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

// 기본은 로그인된 유저 — 게스트 결제 방지 테스트는 userProfile을 따로 넘긴다
const ctx = (premium, userProfile = { authUserId: "u1" }, usage = null) => ({
  premium,
  storageReady: true,
  usage,
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

  it("비로그인 상태에서 복원을 누르면 SDK 호출 전에 로그인 안내를 보여준다", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const guestCtx = ctx({ active: false, kind: null, plan: null, since: null }, {});
    useApp.mockReturnValue(guestCtx);
    const { getByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(getByText("premium.restore")).toBeTruthy());

    fireEvent.press(getByText("premium.restore"));

    expect(restorePurchases).not.toHaveBeenCalled();
    expect(alertSpy.mock.calls.some((c) => c[0] === "premium.login_required_title")).toBe(true);

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

// 서버는 text/video의 used·max를 주는데 앱이 버려서, 프리미엄 사용자도 한도에 부딪히기
// 전까지 자기가 얼마나 남았는지 볼 방법이 없었다 (1.11.8 한도 정직화)
describe("SubscriptionScreen — 남은 횟수 표시", () => {
  beforeEach(() => jest.clearAllMocks());

  it("구독 중이면 오늘 텍스트·이달 영상 사용량을 보여준다", async () => {
    useApp.mockReturnValue(
      ctx({ active: true, kind: "sub", plan: "monthly", since: null }, { authUserId: "u1" }, {
        text: { used: 3, max: 10, left: 7 },
        video: { used: 2, max: 15, left: 13 },
      })
    );
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.active_title")).toBeTruthy());
    expect(queryByText('quota.today_text:{"used":3,"max":10}')).toBeTruthy();
    expect(queryByText('quota.month_video:{"used":2,"max":15}')).toBeTruthy();
  });

  it("사용량을 못 받았으면(구서버·오프라인) 아무것도 안 보여준다", async () => {
    useApp.mockReturnValue(ctx({ active: true, kind: "sub", plan: "monthly", since: null }));
    const { queryByText } = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(queryByText("premium.active_title")).toBeTruthy());
    expect(queryByText(/^quota\./)).toBeNull();
  });
});


describe("SubscriptionScreen — 계정 소유권·복원 실패·중복 실행", () => {
  let current, alertSpy;
  const yearly = { product: { priceString: "₩49,000" } };
  const handlerFor = (ui, label) => {
    let node = ui.getByText(label);
    while (node && typeof node.props.onPress !== "function") node = node.parent;
    return node.props.onPress;
  };
  const mountReady = async () => {
    const ui = render(<SubscriptionScreen navigation={navigation} />);
    await waitFor(() => expect(ui.queryByText("premium.yearly")).toBeTruthy());
    return ui;
  };
  beforeEach(() => {
    jest.clearAllMocks(); mockScope = "account:u1";
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    getPremiumOffering.mockResolvedValue({ annual: yearly });
    getPremiumEntitlement.mockResolvedValue(null);
    purchasePremium.mockResolvedValue({ success: true, cancelled: false });
    restorePurchases.mockResolvedValue({ success: true });
    current = ctx({ active: false });
    useApp.mockImplementation(() => current);
  });
  afterEach(() => { alertSpy.mockRestore(); mockScope = "account:u1"; });

  it("구매와 복원 서비스에 현재 계정 및 소유권 검사 함수를 전달한다", async () => {
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.cta_subscribe"));
    await waitFor(() => expect(purchasePremium).toHaveBeenCalledWith(yearly, { authUserId: "u1", isCurrent: expect.any(Function) }));
    await act(async () => {});
    fireEvent.press(ui.getByText("premium.restore"));
    await waitFor(() => expect(restorePurchases).toHaveBeenCalledWith({ authUserId: "u1", isCurrent: expect.any(Function) }));
  });

  it.each([
    ["account_link_failed", "premium.account_link_failed"],
    ["store_error", "premium.restore_fail"],
    ["no_entitlement", "premium.restore_none"],
  ])("복원 실패 %s는 성공이나 다른 실패와 구분한다", async (reason, message) => {
    restorePurchases.mockResolvedValue({ success: false, reason });
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.restore"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("premium.title", message));
    expect(current.markPremiumActive).not.toHaveBeenCalled();
    expect(current.refreshPremium).not.toHaveBeenCalled();
  });

  it("구매 계정 연결 실패는 결제 성공으로 안내하지 않는다", async () => {
    purchasePremium.mockResolvedValue({ success: false, reason: "account_link_failed" });
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.cta_subscribe"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("premium.title", "premium.account_link_failed"));
    expect(current.markPremiumActive).not.toHaveBeenCalled();
  });

  it("같은 렌더의 연속 구매·복원 호출도 한 번만 실행한다", async () => {
    let finish;
    purchasePremium.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const ui = await mountReady();
    const purchase = handlerFor(ui, "premium.cta_subscribe"), restore = handlerFor(ui, "premium.restore");
    act(() => { purchase(); purchase(); restore(); });
    await waitFor(() => expect(purchasePremium).toHaveBeenCalledTimes(1));
    expect(restorePurchases).not.toHaveBeenCalled();
    await act(async () => finish({ success: true }));
  });

  it.each(["account", "scope", "unmount"])("구매 대기 중 %s 변경 뒤 이전 계정 성공 처리를 하지 않는다", async (change) => {
    let finish;
    purchasePremium.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const original = current;
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.cta_subscribe"));
    await waitFor(() => expect(purchasePremium).toHaveBeenCalled());
    if (change === "account") {
      current = ctx({ active: false }, { authUserId: "B" });
      ui.rerender(<SubscriptionScreen navigation={navigation} />);
    } else if (change === "scope") mockScope = "account:B";
    else ui.unmount();
    await act(async () => finish({ success: true }));
    expect(original.markPremiumActive).not.toHaveBeenCalled();
    expect(original.refreshPremium).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("복원 도중 계정이 바뀌면 성공 알림과 프리미엄 활성화를 실행하지 않는다", async () => {
    let finish;
    restorePurchases.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const original = current;
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.restore"));
    current = ctx({ active: false }, { authUserId: "B" });
    ui.rerender(<SubscriptionScreen navigation={navigation} />);
    await act(async () => finish({ success: true }));
    expect(original.markPremiumActive).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("성공 알림 뒤 계정이 바뀌면 알림의 확인 버튼도 새 화면을 닫지 않는다", async () => {
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.restore"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const confirm = alertSpy.mock.calls[0][2][0].onPress;
    current = ctx({ active: false }, { authUserId: "B" });
    ui.rerender(<SubscriptionScreen navigation={navigation} />);
    act(confirm);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("복원 요청 예외는 구매 없음으로 안내하지 않고 다음 시도를 허용한다", async () => {
    restorePurchases.mockRejectedValueOnce(new Error("offline"));
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.restore"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("premium.title", "premium.restore_fail"));
    expect(current.markPremiumActive).not.toHaveBeenCalled();
    fireEvent.press(ui.getByText("premium.restore"));
    await waitFor(() => expect(restorePurchases).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(current.markPremiumActive).toHaveBeenCalledWith({ kind: "sub" }));
  });

  it("스토어에서 취소한 구매는 실패 알림이나 프리미엄 활성화를 만들지 않는다", async () => {
    purchasePremium.mockResolvedValueOnce({ success: false, cancelled: true, reason: "store_error" });
    const ui = await mountReady();
    fireEvent.press(ui.getByText("premium.cta_subscribe"));
    await waitFor(() => expect(purchasePremium).toHaveBeenCalled());
    await act(async () => {});
    expect(alertSpy).not.toHaveBeenCalled();
    expect(current.markPremiumActive).not.toHaveBeenCalled();
  });

  it("A의 늦은 만료일 조회가 B 구독 화면에 나타나지 않는다", async () => {
    let finishA;
    getPremiumEntitlement.mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve; }));
    current = ctx({ active: true, kind: "sub" });
    const ui = render(<SubscriptionScreen navigation={navigation} />);
    current = ctx({ active: true, kind: "sub" }, { authUserId: "B" });
    ui.rerender(<SubscriptionScreen navigation={navigation} />);
    await act(async () => finishA({ expirationDate: "2027-09-01T00:00:00Z", productIdentifier: "artlink_premium_yearly" }));
    expect(getPremiumEntitlement).toHaveBeenCalledWith("B");
    expect(ui.queryByText(/^premium.next_billing/)).toBeNull();
  });
});
