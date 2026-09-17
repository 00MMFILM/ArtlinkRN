// 커뮤니티 왕관 — community_posts에 author_premium 컬럼이 없어(PostgREST 400) 글에 저장할 수 없다.
// 서버가 주는 활성 프리미엄 id 목록에 user_id가 있는 글에만 왕관을 그린다. 목록을 못 받으면 배지 없음.
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import CommunityScreen from "../CommunityScreen";
import { useApp } from "../../context/AppContext";
import { fetchPosts } from "../../services/communityService";
import { fetchPremiumUserIds } from "../../services/premiumService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/communityService", () => ({
  fetchPosts: jest.fn(),
  getDemoPosts: jest.fn(() => []),
  invalidatePostsCache: jest.fn(),
}));
jest.mock("../../services/premiumService", () => ({ fetchPremiumUserIds: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-navigation/native", () => {
  // 렌더마다 새 객체를 주면 focus 리스너 effect가 매 렌더 재구독돼 무한 루프가 난다 — 고정 객체.
  const nav = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
  return { useNavigation: () => nav };
});

const POSTS = [
  { id: "p1", user_id: "u-premium", author_name: "프리미엄", type: "팁 공유", title: "유료 글", content: "본문", created_at: new Date().toISOString() },
  { id: "p2", user_id: "u-free", author_name: "무료", type: "팁 공유", title: "무료 글", content: "본문", created_at: new Date().toISOString() },
];

beforeEach(() => {
  jest.clearAllMocks();
  useApp.mockReturnValue({
    blockedUsers: [],
    handleBlockUser: jest.fn(),
    handleReportContent: jest.fn(),
    deviceUserId: "me",
    userProfile: {},
  });
  fetchPosts.mockResolvedValue(POSTS);
});

describe("CommunityScreen — 프리미엄 왕관", () => {
  it("목록에 있는 user_id의 글에만 왕관을 그린다", async () => {
    fetchPremiumUserIds.mockResolvedValue(new Set(["u-premium"]));
    const { getAllByTestId, getByText } = render(<CommunityScreen />);
    await waitFor(() => getByText("유료 글"));
    await waitFor(() => expect(getAllByTestId("premium-badge")).toHaveLength(1));
  });

  it("목록 조회가 실패(null)하면 왕관이 하나도 안 보이고 글은 그대로 보인다", async () => {
    fetchPremiumUserIds.mockResolvedValue(null);
    const { queryAllByTestId, getByText } = render(<CommunityScreen />);
    await waitFor(() => getByText("유료 글"));
    expect(queryAllByTestId("premium-badge")).toHaveLength(0);
    expect(getByText("무료 글")).toBeTruthy();
  });

  it("프리미엄 id 목록은 마운트당 한 번만 조회한다", async () => {
    fetchPremiumUserIds.mockResolvedValue(new Set(["u-premium"]));
    const { getByText } = render(<CommunityScreen />);
    await waitFor(() => getByText("유료 글"));
    expect(fetchPremiumUserIds).toHaveBeenCalledTimes(1);
  });
});
