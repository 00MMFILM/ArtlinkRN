jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../apiConfig", () => ({ MATCHING_SERVER_URL: "https://example.org", getApiHeaders: () => ({ "Content-Type": "application/json" }) }));
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchOpportunityPage, setOpportunitySaved, loadSavedOpportunities, OPPORTUNITY_SAVED_KEY } from "../opportunityService";
import { setStorageScope, clearAccountStorage, scopedKey } from "../../utils/accountStorage";

beforeEach(async () => { await AsyncStorage.clear(); global.fetch = jest.fn(); });
afterEach(() => { delete global.fetch; });

test("loads exactly one 30-item page with the endpoint's existing filters", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => Array.from({ length: 30 }, (_, id) => ({ id, title: "post" })) });
  const result = await fetchOpportunityPage({ page: 2, field: "acting", category: "오디션" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ page: 2, limit: 30, field: "acting", tab: "오디션" });
  expect(result.hasMore).toBe(true);
  expect(result.items).toHaveLength(30);
});

test("does not invent postings on an invalid response or offline failure", async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ unexpected: true }) }).mockRejectedValueOnce(new Error("offline"));
  expect(await fetchOpportunityPage()).toMatchObject({ items: [], error: "invalid_response" });
  expect(await fetchOpportunityPage()).toMatchObject({ items: [], error: "network" });
});

test("saved snapshots survive reload, isolate accounts and are erased only for their owner", async () => {
  const post = { id: "1", source: "ai", title: "Casting" };
  await setStorageScope("account:A");
  await setOpportunitySaved(post, true);
  await setStorageScope("account:B");
  expect(await loadSavedOpportunities()).toEqual([]);
  expect(await loadSavedOpportunities("account:A")).toEqual([expect.objectContaining({ post })]);
  await setOpportunitySaved({ ...post, title: "B record" }, true);
  await clearAccountStorage("account:A");
  expect(await AsyncStorage.getItem(scopedKey(OPPORTUNITY_SAVED_KEY, "account:A"))).toBeNull();
  expect((await loadSavedOpportunities())[0].post.title).toBe("B record");
});

test("concurrent saves preserve both listings and same id from two sources", async () => {
  await setStorageScope("account:A");
  await Promise.all([setOpportunitySaved({ id: 1, source: "ai" }, true), setOpportunitySaved({ id: 1, source: "user" }, true)]);
  expect(await loadSavedOpportunities()).toHaveLength(2);
  await setOpportunitySaved({ id: 1, source: "ai" }, false);
  expect((await loadSavedOpportunities()).map((row) => row.post.source)).toEqual(["user"]);
});
