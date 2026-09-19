// 항목10: 공유 카드의 브랜드 문구·CTA·푸터가 한국어로 하드코딩돼 있던 문제 — i18n 키로 뺀다.
import React from "react";
import { render } from "@testing-library/react-native";
import FeedbackShareCard from "../FeedbackShareCard";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k) }),
}));
jest.mock("expo-linear-gradient", () => {
  const RN = require("react-native");
  return { LinearGradient: RN.View };
});

describe("FeedbackShareCard — i18n", () => {
  it("브랜드·CTA·푸터 문구를 i18n 키로 렌더한다", () => {
    const utils = render(
      <FeedbackShareCard
        variant="feed"
        fieldEmoji="🎭"
        fieldLabel="연기"
        dateLabel="9월 19일"
        title="제목"
        chips={["a", "b"]}
        blocks={[{ h: "shareCard.section_observation", b: "내용" }]}
      />
    );
    expect(utils.getByText("shareCard.brand")).toBeTruthy();
    expect(utils.getByText("shareCard.cta")).toBeTruthy();
    expect(utils.getByText("shareCard.footer")).toBeTruthy();
    expect(utils.getByText('shareCard.chips_count:{"count":2}')).toBeTruthy();
  });
});
