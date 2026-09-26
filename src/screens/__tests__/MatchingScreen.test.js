import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import MatchingScreen from "../MatchingScreen";
import { fetchMatchingFeed } from "../../services/matchingService";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock("../../context/AppContext", () => ({ useApp: () => ({
  artistProfile: {}, userProfile: {}, savedNotes: [], portfolioItems: [],
  matchingPosts: [], matchingDeletedIds: [], blockedUsers: [],
}) }));
jest.mock("../../services/analyticsService", () => ({ computeMatchPercent: () => 70 }));
jest.mock("../../services/matchingService", () => ({
  fetchMatchingFeed: jest.fn(), fetchUserMatchingPosts: jest.fn(async () => []),
  mergeUserMatchingPosts: () => [],
}));

const post = {
  id: "post-1", source: "ai", sourcePlatform: "필름메이커스", sourceUrl: "https://example.org/post/1",
  title: "배우 모집", description: "촬영 공고", tab: "프로젝트", field: "acting", tags: [],
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it("shows the source and opens the app detail without skipping its application information", async () => {
  // A legacy externalUrl must not skip the new source/application screen either.
  fetchMatchingFeed.mockResolvedValue({ items: [{ ...post, externalUrl: "https://wrong.example.org/" }], error: null });
  const navigation = { navigate: jest.fn() };
  const open = jest.spyOn(Linking, "openURL");
  const view = render(<MatchingScreen navigation={navigation} />);
  await waitFor(() => expect(view.getByText("필름메이커스")).toBeTruthy());
  fireEvent.press(view.getByText("matching.view_detail"));
  expect(navigation.navigate).toHaveBeenCalledWith("MatchingPostDetail", { post: expect.objectContaining({ sourceUrl: post.sourceUrl }) });
  expect(open).not.toHaveBeenCalled();
});

it("keeps today's deadline visible and hides past or inactive postings", async () => {
  jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-26T12:00:00Z"));
  fetchMatchingFeed.mockResolvedValue({ items: [
    { ...post, deadline: "2026-09-26" },
    { ...post, id: "past", title: "어제 마감", deadline: "2026-09-25" },
    { ...post, id: "closed", title: "종료된 공고", status: "closed", deadline: "2099-01-01" },
  ], error: null });
  const view = render(<MatchingScreen navigation={{ navigate: jest.fn() }} />);
  await waitFor(() => expect(view.getByText("배우 모집")).toBeTruthy());
  expect(view.getByText("matchingDetail.deadline_today")).toBeTruthy();
  expect(view.queryByText("어제 마감")).toBeNull();
  expect(view.queryByText("종료된 공고")).toBeNull();
});
