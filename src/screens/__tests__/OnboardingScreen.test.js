import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import OnboardingScreen from "../OnboardingScreen";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

// 온보딩 첫 화면이 번역 없이 영어로 고정돼 있던 버그(2026-09) — t() 키로 나가야 한다
describe("OnboardingScreen — 첫 화면 문구", () => {
  it("제목·본문·CTA·안내문이 하드코딩 영어가 아니라 번역 키로 렌더된다", () => {
    const { getByText, queryByText } = render(<OnboardingScreen onComplete={jest.fn()} />);
    expect(getByText("onboarding.landing_title")).toBeTruthy();
    expect(getByText("onboarding.landing_body")).toBeTruthy();
    expect(getByText("onboarding.landing_cta")).toBeTruthy();
    expect(getByText("onboarding.landing_note")).toBeTruthy();
    expect(queryByText("Your AI Art Coach")).toBeNull();
    expect(queryByText("Get Started")).toBeNull();
  });

  it("분야 칩은 기존 fields 번역 키를 재사용한다", () => {
    const { getByText } = render(<OnboardingScreen onComplete={jest.fn()} />);
    expect(getByText("fields.acting")).toBeTruthy();
    expect(getByText("fields.music")).toBeTruthy();
    expect(getByText("fields.film")).toBeTruthy();
  });

  it("CTA를 누르면 onComplete가 호출된다", () => {
    const onComplete = jest.fn();
    const { getByText } = render(<OnboardingScreen onComplete={onComplete} />);
    fireEvent.press(getByText("onboarding.landing_cta"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
