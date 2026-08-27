import {
  isActor,
  postMatchesField,
  visibleCommunityPosts,
  toLocalDateKey,
} from "../helpers";

describe("isActor (배우 게이팅)", () => {
  it("연기 전공이면 true", () => {
    expect(isActor(["acting"])).toBe(true);
  });
  it("다전공에 연기가 포함되면 true", () => {
    expect(isActor(["music", "acting"])).toBe(true);
  });
  it("연기가 없으면 false", () => {
    expect(isActor(["music", "art"])).toBe(false);
  });
  it("빈 배열·undefined·null 은 안전하게 false", () => {
    expect(isActor([])).toBe(false);
    expect(isActor(undefined)).toBe(false);
    expect(isActor(null)).toBe(false);
  });
});

describe("postMatchesField (분야 필터 단건)", () => {
  it("전체/미지정이면 항상 통과", () => {
    expect(postMatchesField({ author_field: "music" }, "전체")).toBe(true);
    expect(postMatchesField({ author_field: "music" }, null)).toBe(true);
    expect(postMatchesField({ author_field: "music" }, undefined)).toBe(true);
  });
  it("author_field 가 일치하면 통과", () => {
    expect(postMatchesField({ author_field: "acting" }, "acting")).toBe(true);
  });
  it("불일치면 제외", () => {
    expect(postMatchesField({ author_field: "music" }, "acting")).toBe(false);
  });
  it("author_field 없으면 field 로 폴백", () => {
    expect(postMatchesField({ field: "dance" }, "dance")).toBe(true);
  });
  it("분야값이 아예 없는 글은 특정 분야 필터에서 제외", () => {
    expect(postMatchesField({}, "acting")).toBe(false);
  });
});

describe("visibleCommunityPosts (피드 최종 필터)", () => {
  const posts = [
    { id: 1, author_name: "배우A", author_field: "acting" },
    { id: 2, author_name: "음악가B", author_field: "music" },
    { id: 3, author_name: "배우C", author_field: "acting" },
    { id: 4, author_name: "익명D" }, // 분야 미지정
  ];

  it("전체 선택 시 차단만 적용", () => {
    const r = visibleCommunityPosts(posts, { blockedUsers: [], activeField: "전체" });
    expect(r.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });
  it("연기 선택 시 연기 글만 노출 (배우 개인화)", () => {
    const r = visibleCommunityPosts(posts, { blockedUsers: [], activeField: "acting" });
    expect(r.map((p) => p.id)).toEqual([1, 3]);
  });
  it("분야 필터 + 차단이 함께 적용됨", () => {
    const r = visibleCommunityPosts(posts, { blockedUsers: ["배우A"], activeField: "acting" });
    expect(r.map((p) => p.id)).toEqual([3]);
  });
  it("posts 가 없거나 옵션이 없어도 안전", () => {
    expect(visibleCommunityPosts(undefined, {})).toEqual([]);
    expect(visibleCommunityPosts([], {})).toEqual([]);
    expect(visibleCommunityPosts(posts).map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("toLocalDateKey (KST 자정~오전9시 UTC 이월 버그 재현/검증)", () => {
  const originalTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Seoul";
  });
  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("KST 2026-08-27 오전 2시(=UTC 08-26 17시)는 로컬 기준 08-27", () => {
    const d = new Date("2026-08-26T17:00:00.000Z");
    expect(toLocalDateKey(d)).toBe("2026-08-27");
    // 버그였던 UTC 기준 구현(toISOString)이면 08-26으로 잘못 나왔음을 대조
    expect(d.toISOString().split("T")[0]).toBe("2026-08-26");
  });

  it("KST 자정 직후(00:30)도 당일로 인식", () => {
    const d = new Date("2026-08-26T15:30:00.000Z"); // KST 08-27 00:30
    expect(toLocalDateKey(d)).toBe("2026-08-27");
  });

  it("문자열 ISO 입력도 동일하게 동작", () => {
    expect(toLocalDateKey("2026-08-26T17:00:00.000Z")).toBe("2026-08-27");
  });

  it("KST 낮 시간은 UTC와 로컬 날짜가 같음", () => {
    const d = new Date("2026-08-27T05:00:00.000Z"); // KST 08-27 14:00
    expect(toLocalDateKey(d)).toBe("2026-08-27");
  });
});
