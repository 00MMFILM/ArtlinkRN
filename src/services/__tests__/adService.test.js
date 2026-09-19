import { showRewardedAd } from "../adService";
import { RewardedAd, RewardedAdEventType, AdEventType } from "react-native-google-mobile-ads";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));
jest.mock("react-native-google-mobile-ads", () => {
  function makeFakeAdClass() {
    let lastAd = null;
    return {
      createForAdRequest: jest.fn(() => {
        const listeners = {};
        const ad = {
          addAdEventListener: jest.fn((type, cb) => {
            (listeners[type] = listeners[type] || []).push(cb);
            return jest.fn();
          }),
          load: jest.fn(),
          show: jest.fn(),
          __emit: (type) => (listeners[type] || []).forEach((cb) => cb()),
        };
        lastAd = ad;
        return ad;
      }),
      __last: () => lastAd,
    };
  }
  return {
    InterstitialAd: makeFakeAdClass(),
    RewardedAd: makeFakeAdClass(),
    AdEventType: { LOADED: "loaded", CLOSED: "closed", ERROR: "error" },
    RewardedAdEventType: { LOADED: "r_loaded", EARNED_REWARD: "earned" },
    TestIds: { INTERSTITIAL: "t-int", REWARDED: "t-rewarded", ADAPTIVE_BANNER: "t-banner" },
  };
});

// 버그: 20초 타임아웃이 광고 로드 후에도 살아 있어, 20초 넘게 시청한 보상형 광고가 실패 처리됐다(2026-09)
describe("adService — 보상형 광고 타임아웃", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("로드된 뒤에는 20초가 지나도 실패 처리하지 않는다", async () => {
    const promise = showRewardedAd();
    const ad = RewardedAd.__last();

    ad.__emit(RewardedAdEventType.LOADED);
    expect(ad.show).toHaveBeenCalledTimes(1);

    // 시청이 20초를 넘어가도(=로드 타임아웃 시각 경과) 실패로 끝나면 안 된다
    jest.advanceTimersByTime(25000);

    ad.__emit(RewardedAdEventType.EARNED_REWARD);
    ad.__emit(AdEventType.CLOSED);

    await expect(promise).resolves.toBe(true);
  });

  it("로드 자체가 20초 안에 안 되면 타임아웃으로 실패 처리한다", async () => {
    const promise = showRewardedAd();
    jest.advanceTimersByTime(20000);
    await expect(promise).resolves.toBe(false);
  });

  it("에러 이벤트가 오면 즉시 실패 처리한다", async () => {
    const promise = showRewardedAd();
    const ad = RewardedAd.__last();
    ad.__emit(AdEventType.ERROR);
    await expect(promise).resolves.toBe(false);
  });

  it("show()가 던지면 멈추지 않고 실패로 끝난다", async () => {
    const promise = showRewardedAd();
    const ad = RewardedAd.__last();
    ad.show.mockImplementation(() => { throw new Error("not ready"); });
    ad.__emit(RewardedAdEventType.LOADED);
    await expect(promise).resolves.toBe(false);
  });

  it("닫힘·오류가 끝내 안 와도 5분 뒤에는 끝난다 (무한 대기 방지)", async () => {
    const promise = showRewardedAd();
    const ad = RewardedAd.__last();
    ad.__emit(RewardedAdEventType.LOADED);
    ad.__emit(RewardedAdEventType.EARNED_REWARD);
    jest.advanceTimersByTime(5 * 60 * 1000);
    await expect(promise).resolves.toBe(true);
  });
});
