// supabase 클라이언트는 이 테스트에서 쓰지 않으므로 mock (env/네트워크 의존 제거)
jest.mock("../supabaseClient", () => ({ supabase: {} }));

import { normalizeServerMatchingPost, mergeUserMatchingPosts } from "../matchingService";

const serverRow = (localId, extra = {}) => ({
  id: "uuid-" + localId,
  local_id: localId,
  auth_user_id: "auth-1",
  author_name: "다른 사용자",
  author_field: "acting",
  tab: "프로젝트",
  title: "서버 공고",
  field: "acting",
  description: "서버에서 온 설명",
  deadline: "2026-09-01",
  tags: ["단편"],
  contact: "a@b.com",
  requirements: { gender: "female", ageRange: [20, 29] },
  created_at: "2026-08-01T00:00:00.000Z",
  ...extra,
});

const localPost = (id, extra = {}) => ({
  id,
  source: "user",
  tab: "프로젝트",
  title: "내 공고",
  field: "acting",
  description: "로컬 설명",
  createdAt: "2026-08-10T00:00:00.000Z",
  ...extra,
});

describe("normalizeServerMatchingPost", () => {
  it("서버 row를 화면이 쓰는 키로 변환한다", () => {
    expect(normalizeServerMatchingPost(serverRow(111))).toEqual({
      id: 111,
      serverId: "uuid-111",
      source: "user",
      tab: "프로젝트",
      title: "서버 공고",
      field: "acting",
      description: "서버에서 온 설명",
      deadline: "2026-09-01",
      tags: ["단편"],
      contact: "a@b.com",
      requirements: { gender: "female", ageRange: [20, 29] },
      authorName: "다른 사용자",
      authorField: "acting",
      createdAt: "2026-08-01T00:00:00.000Z",
      authUserId: "auth-1",
    });
  });

  it("title/description/tags/requirements 가 없는 row도 안전하게 변환한다", () => {
    const bare = normalizeServerMatchingPost({ id: "uuid-x", created_at: "2026-08-01T00:00:00.000Z" });
    expect(bare.id).toBe("uuid-x"); // local_id 없으면 서버 id
    expect(bare.title).toBe("");
    expect(bare.description).toBe("");
    expect(bare.tags).toEqual([]);
    expect(bare.requirements).toEqual({});
    expect(bare.field).toBe("etc");
    expect(bare.tab).toBe("프로젝트");

    // 화면(MatchingScreen 검색 필터)이 하는 접근이 크래시 나지 않아야 한다
    expect(() => bare.title.toLowerCase() + bare.description.toLowerCase()).not.toThrow();
  });
});

describe("mergeUserMatchingPosts", () => {
  it("서버+로컬을 병합하되 local_id가 겹치는 내 공고는 중복 노출하지 않는다", () => {
    const server = [serverRow(111), serverRow(222)].map(normalizeServerMatchingPost);
    const local = [localPost(111), localPost(999)]; // 111은 서버 저장 성공분, 999는 실패분

    const merged = mergeUserMatchingPosts(local, server);

    expect(merged).toHaveLength(3);
    expect(merged.map((p) => p.id).sort()).toEqual([111, 222, 999]);
    expect(merged.filter((p) => p.id === 111)).toHaveLength(1);
    // 겹치는 건 서버본이 남는다
    expect(merged.find((p) => p.id === 111).serverId).toBe("uuid-111");
    // 서버 저장 실패했던 내 로컬 공고는 보존
    expect(merged.find((p) => p.id === 999)).toEqual(localPost(999));
  });

  it("createdAt 내림차순으로 정렬한다", () => {
    const server = [
      serverRow(1, { created_at: "2026-08-05T00:00:00.000Z" }),
      serverRow(2, { created_at: "2026-08-20T00:00:00.000Z" }),
    ].map(normalizeServerMatchingPost);
    const local = [localPost(3, { createdAt: "2026-08-12T00:00:00.000Z" })];

    expect(mergeUserMatchingPosts(local, server).map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("서버 실패(빈 배열/undefined)면 로컬 공고만 그대로 보여준다 (회귀 없음)", () => {
    const local = [localPost(1, { createdAt: "2026-08-01T00:00:00.000Z" }), localPost(2, { createdAt: "2026-08-02T00:00:00.000Z" })];

    expect(mergeUserMatchingPosts(local, []).map((p) => p.id)).toEqual([2, 1]);
    expect(mergeUserMatchingPosts(local, undefined).map((p) => p.id)).toEqual([2, 1]);
    expect(mergeUserMatchingPosts(undefined, undefined)).toEqual([]);
  });

  it("서버 row에 local_id가 없어도(uuid id) 로컬 공고를 지우지 않는다", () => {
    const server = [normalizeServerMatchingPost({ id: "uuid-x", title: "익명", created_at: "2026-08-01T00:00:00.000Z" })];
    const local = [localPost(NaN), localPost(5)];

    const merged = mergeUserMatchingPosts(local, server);
    expect(merged).toHaveLength(3);
  });

  it("툼스톤에 있는 id는 서버본이 있어도 병합 결과에서 제외한다 (삭제 후 재출현 방지)", () => {
    const server = [serverRow(111), serverRow(222)].map(normalizeServerMatchingPost);
    const local = [localPost(999)]; // 서버 저장 실패했던 로컬 전용 글

    // 111(서버에도 남아있는 내 글)과 999(로컬 전용)를 지웠다고 가정
    const merged = mergeUserMatchingPosts(local, server, [111, 999]);

    expect(merged.map((p) => p.id)).toEqual([222]);
  });
});
