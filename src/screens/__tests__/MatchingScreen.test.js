import React from "react";
import { render, fireEvent, waitFor, within, act } from "@testing-library/react-native";
import { Linking, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import { fetchUserMatchingPosts } from "../../services/matchingService";
import MatchingScreen from "../MatchingScreen";
import { fetchOpportunityPage, loadSavedOpportunities, setOpportunitySaved } from "../../services/opportunityService";

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../utils/accountStorage", () => ({ getStorageScope: () => "account:A" }));
jest.mock("../../services/opportunityService", () => ({ fetchOpportunityPage: jest.fn(), loadSavedOpportunities: jest.fn(async () => []), setOpportunitySaved: jest.fn(async () => []) }));
jest.mock("../../services/matchingService", () => ({
  fetchUserMatchingPosts: jest.fn(async () => []),
  mergeUserMatchingPosts: (local = [], server = []) => [...local, ...server],
}));

const post = {
  id: "post-1", source: "ai", sourcePlatform: "필름메이커스", sourceUrl: "https://example.org/post/1",
  title: "배우 모집", description: "촬영 공고", tab: "프로젝트", field: "acting", tags: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  useApp.mockReturnValue({ artistProfile: {}, userProfile: {}, savedNotes: [], portfolioItems: [], matchingPosts: [], matchingDeletedIds: [], blockedUsers: [], handleDeleteMatchingPost: jest.fn() });
  fetchUserMatchingPosts.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

it("shows the source and opens the app detail without skipping its application information", async () => {
  // A legacy externalUrl must not skip the new source/application screen either.
  fetchOpportunityPage.mockResolvedValue({ items: [{ ...post, externalUrl: "https://wrong.example.org/" }], error: null });
  const navigation = { navigate: jest.fn() };
  const open = jest.spyOn(Linking, "openURL");
  const view = render(<MatchingScreen navigation={navigation} />);
  await waitFor(() => expect(view.getByText("필름메이커스")).toBeTruthy());
  fireEvent.press(view.getByText("matching.view_detail →"));
  expect(navigation.navigate).toHaveBeenCalledWith("MatchingPostDetail", { post: expect.objectContaining({ sourceUrl: post.sourceUrl }) });
  expect(open).not.toHaveBeenCalled();
});

it("keeps today's deadline visible and hides past or inactive postings", async () => {
  jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-26T12:00:00Z"));
  fetchOpportunityPage.mockResolvedValue({ items: [
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


it("filters only explicit language and never displays a match percentage", async () => {
  fetchOpportunityPage.mockResolvedValue({ items: [post, { ...post, id: "en", title: "English role", requirements: { language: "English" } }], error: null, hasMore: true });
  const view = render(<MatchingScreen navigation={{ navigate: jest.fn() }} />);
  await waitFor(() => expect(view.getByText("배우 모집")).toBeTruthy());
  expect(view.queryByText(/matching.match_percent/)).toBeNull();
  fireEvent.press(view.getByTestId("opportunity-filters"));
  fireEvent.changeText(view.getByTestId("opportunity-language"), "English");
  fireEvent.press(view.getByTestId("opportunity-apply-filters"));
  expect(view.queryByText("배우 모집")).toBeNull();
  expect(view.getByText("English role")).toBeTruthy();
});

it("loads the next page explicitly and keeps the first page on a later failure", async () => {
  fetchOpportunityPage.mockResolvedValueOnce({ items: [post], error: null, hasMore: true })
    .mockResolvedValueOnce({ items: [], error: "network", hasMore: false });
  const view = render(<MatchingScreen navigation={{ navigate: jest.fn() }} />);
  await waitFor(() => expect(view.getByText("배우 모집")).toBeTruthy());
  expect(fetchOpportunityPage).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByTestId("opportunity-load-more"));
  await waitFor(() => expect(view.getByText("opportunities.error")).toBeTruthy());
  expect(view.getByText("배우 모집")).toBeTruthy();
  expect(fetchOpportunityPage).toHaveBeenLastCalledWith({ page: 2, field: "all", category: "all" });
});

it("shows a saved snapshot even when the feed is offline and saves in the captured account", async () => {
  fetchOpportunityPage.mockResolvedValue({ items: [], error: "network", hasMore: false });
  loadSavedOpportunities.mockResolvedValueOnce([{ post }]);
  const view = render(<MatchingScreen navigation={{ navigate: jest.fn() }} />);
  fireEvent.press(view.getByTestId("opportunity-view-saved"));
  await waitFor(() => expect(view.getByText("배우 모집")).toBeTruthy());
  fireEvent.press(view.getByTestId("save-ai:post-1"));
  await waitFor(() => expect(setOpportunitySaved).toHaveBeenCalledWith(post, false, "account:A"));
});

it.each(["local", "authenticated"]) ("can edit and delete my expired %s listing via the member filter", async (ownership) => {
  const own = { ...post, id: "my-closed", source: "user", title: "마감된 내 공고", status: "closed", ...(ownership === "authenticated" ? { authUserId: "account-a" } : {}) };
  const handleDeleteMatchingPost = jest.fn();
  useApp.mockReturnValue({ userProfile: { authUserId: "account-a" }, matchingPosts: ownership === "local" ? [own] : [], matchingDeletedIds: [], blockedUsers: [], handleDeleteMatchingPost });
  if (ownership === "authenticated") fetchUserMatchingPosts.mockResolvedValue([own]);
  fetchOpportunityPage.mockResolvedValue({ items: [], error: null, hasMore: false });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const navigation = { navigate: jest.fn() };
  const view = render(<MatchingScreen navigation={navigation} />);
  await waitFor(() => expect(fetchUserMatchingPosts).toHaveBeenCalled());
  expect(view.queryByText(own.title)).toBeNull();
  fireEvent.press(view.getByTestId("opportunity-filters"));
  fireEvent.press(view.getByText("opportunities.source_user"));
  fireEvent.press(view.getByTestId("opportunity-apply-filters"));
  await waitFor(() => expect(view.getByText(own.title)).toBeTruthy());
  const card = view.getByTestId("opportunity-user:my-closed");
  expect(within(card).getByText("matching.deadline_expired")).toBeTruthy();
  fireEvent.press(within(card).getByLabelText("opportunities.manage"));
  const actions = Alert.alert.mock.calls.at(-1)[2];
  act(() => actions.find((action) => action.text === "common.edit").onPress());
  expect(navigation.navigate).toHaveBeenCalledWith("MatchingPostCreate", { post: own });
  act(() => actions.find((action) => action.text === "common.delete").onPress());
  expect(handleDeleteMatchingPost).not.toHaveBeenCalled();
  const confirm = Alert.alert.mock.calls.at(-1)[2].find((action) => action.text === "common.delete");
  act(() => confirm.onPress());
  expect(handleDeleteMatchingPost).toHaveBeenCalledWith(own.id);
});

it("does not grant edit or delete access to another member's closed listing", async () => {
  const other = { ...post, id: "other-closed", source: "user", title: "다른 회원의 마감 공고", authUserId: "account-b", status: "closed" };
  useApp.mockReturnValue({ userProfile: { authUserId: "account-a" }, matchingPosts: [], matchingDeletedIds: [], blockedUsers: [] });
  fetchUserMatchingPosts.mockResolvedValue([other]);
  fetchOpportunityPage.mockResolvedValue({ items: [], error: null, hasMore: false });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const view = render(<MatchingScreen navigation={{ navigate: jest.fn() }} />);
  fireEvent.press(view.getByTestId("opportunity-filters"));
  fireEvent.press(view.getByText("opportunities.source_user"));
  fireEvent.press(view.getByTestId("opportunity-apply-filters"));
  await waitFor(() => expect(view.getByText(other.title)).toBeTruthy());
  fireEvent.press(within(view.getByTestId("opportunity-user:other-closed")).getByLabelText("opportunities.manage"));
  const actions = Alert.alert.mock.calls.at(-1)[2].map((action) => action.text);
  expect(actions).not.toContain("common.edit");
  expect(actions).not.toContain("common.delete");
  expect(actions).toContain("common.report_title");
});
