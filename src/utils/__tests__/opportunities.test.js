import { opportunityFacts, filterOpportunities, buildApplicationPrefill, opportunityReasons } from "../opportunities";

const post = { id: "a", source: "ai", field: "acting", title: "English film in Korea", description: "Remote, paid roles", sourcePlatform: "필름메이커스", sourceUrl: "https://example.org/a" };
const t = (key, args) => args?.title ? `${key}:${args.title}` : key;

test("does not infer country, pay, language or remote availability from prose or source", () => {
  expect(opportunityFacts(post)).toEqual({ location: "", country: "", languages: [], pay: "", paid: null, remote: null, submissions: [] });
  expect(filterOpportunities([post], { paid: true })).toEqual([]);
  expect(filterOpportunities([post], { language: "English" })).toEqual([]);
  expect(filterOpportunities([post], { remote: true })).toEqual([]);
});

test("reads actual feed pay/location and structured requirements only", () => {
  const item = { ...post, location: "London", pay: "£100 / day", requirements: { language: "English", remote: true, submissions: ["Self tape"] } };
  expect(filterOpportunities([item], { region: "london", language: "english", remote: true, paid: true })).toEqual([item]);
  expect(opportunityFacts({ pay: "협의 / 100만원" }).paid).toBeNull();
  expect(opportunityFacts({ pay: "무급" }).paid).toBe(false);
  expect(opportunityFacts({ pay: "0원" }).paid).toBe(false);
});

test("sorts known deadlines and excludes closed listings except in saved view", () => {
  jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-27T01:00:00Z"));
  const closed = { ...post, id: "closed", deadline: "2026-09-26" };
  const tomorrow = { ...post, id: "tomorrow", deadline: "2026-09-28" };
  const today = { ...post, id: "today", deadline: "2026-09-27" };
  expect(filterOpportunities([post, tomorrow, closed, today], { view: "deadline" }).map((v) => v.id)).toEqual(["today", "tomorrow", "a"]);
  expect(filterOpportunities([closed], { view: "saved" })).toEqual([closed]);
  jest.restoreAllMocks();
});

test("recommendation reasons are exact known conditions, not profile performance", () => {
  expect(opportunityReasons(post, ["acting"], {})).toEqual(["field_match"]);
  expect(opportunityReasons(post, ["music"], { region: "Korea", language: "English" })).toEqual([]);
});

test("preparation preserves the valid original and marks unknown materials without claiming submission", () => {
  const result = buildApplicationPrefill({ ...post, contact: "cast@example.org", deadline: "2026-06-31" }, t);
  expect(result.applicationContext).toMatchObject({ postId: "a", sourceUrl: post.sourceUrl, deadline: null, contact: "cast@example.org", submissions: [] });
  expect(result.content).toContain("opportunities.materials_unknown");
  expect(result.content).toContain("opportunities.review_then_apply");
  expect(result).not.toHaveProperty("aiFeedback");
  expect(buildApplicationPrefill({ ...post, sourceUrl: "javascript:alert(1)" }, t).applicationContext.sourceUrl).toBe("");
});

test("closed member posts stay manageable only in the explicit member filter or saved view", () => {
  const member = { ...post, id: "my-expired", source: "user", status: "closed" };
  const collected = { ...post, id: "collected-expired", status: "closed" };
  for (const view of ["latest", "deadline"]) {
    expect(filterOpportunities([member, collected], { view, source: "all" })).toEqual([]);
    expect(filterOpportunities([member, collected], { view, source: "user" })).toEqual([member]);
    expect(filterOpportunities([member, collected], { view, source: "ai" })).toEqual([]);
  }
  expect(filterOpportunities([member, collected], { view: "saved" })).toEqual([member, collected]);
});
