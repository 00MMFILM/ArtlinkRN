// 누구나 "공지" 카테고리로 글을 쓸 수 있던 문제 — 작성 화면의 카테고리 선택지에서 공지를 뺀다.
// (목록 필터 탭의 공지는 그대로 — CommunityScreen.js 소관, 여기서 건드리지 않는다)
import React from "react";
import { render } from "@testing-library/react-native";
import CommunityPostCreateScreen from "../CommunityPostCreateScreen";
import { useApp } from "../../context/AppContext";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/communityService", () => ({
  createPost: jest.fn(),
  moderateContent: jest.fn(async () => ({ safe: true })),
}));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/TopBar", () => {
  const React = require("react");
  const RN = require("react-native");
  return ({ left, right }) => React.createElement(RN.View, null, left, right);
});

const navigation = { goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };

beforeEach(() => {
  jest.clearAllMocks();
  useApp.mockReturnValue({
    deviceUserId: "me",
    userProfile: { name: "나" },
    showToast: jest.fn(),
  });
});

describe("CommunityPostCreateScreen — 공지 카테고리 작성 금지", () => {
  it("카테고리 선택지에 공지(tab_notice)가 없다", () => {
    const utils = render(<CommunityPostCreateScreen navigation={navigation} />);
    expect(utils.queryByText("community.tab_notice")).toBeNull();
  });

  it("나머지 카테고리(팁 공유·작품 공유·질문·콜라보)는 그대로 선택 가능하다", () => {
    const utils = render(<CommunityPostCreateScreen navigation={navigation} />);
    expect(utils.getByText("community.tab_tip")).toBeTruthy();
    expect(utils.getByText("community.tab_work")).toBeTruthy();
    expect(utils.getByText("community.tab_question")).toBeTruthy();
    expect(utils.getByText("community.tab_collab")).toBeTruthy();
  });
});
