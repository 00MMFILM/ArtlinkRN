// 커뮤니티 글 저장 — 서버 community_posts 스키마에 있는 컬럼만 보낸다.
// author_premium 컬럼은 서버에 없다(실측: PostgREST 400 "column community_posts.author_premium does not exist").
// 왕관은 premiumService.fetchPremiumUserIds로 그린다 — 글 저장 경로는 관여하지 않는다.
jest.mock("../apiConfig", () => ({
  SERVER_URL: "https://artlink-server.vercel.app",
  getApiHeaders: () => ({ "Content-Type": "application/json" }),
}));

const mockInsertSpy = jest.fn();
let mockInsertResults = [];

jest.mock("../supabaseClient", () => ({
  supabase: {
    from: () => ({
      insert: (row) => {
        mockInsertSpy(row);
        const result = mockInsertResults.shift();
        return { select: () => ({ single: async () => result }) };
      },
    }),
  },
}));

const { createPost } = require("../communityService");

const args = {
  userId: "u1",
  authorName: "홍길동",
  authorField: "acting",
  type: "팁 공유",
  title: "제목",
  content: "본문",
};

beforeEach(() => {
  mockInsertSpy.mockClear();
  mockInsertResults = [];
});

describe("createPost — 실재하는 컬럼만 저장", () => {
  it("insert 한 번으로 저장하고 저장된 글을 돌려준다", async () => {
    mockInsertResults = [{ data: { id: "p1" }, error: null }];
    const post = await createPost(args);
    expect(post).toEqual({ id: "p1" });
    expect(mockInsertSpy).toHaveBeenCalledTimes(1);
    expect(mockInsertSpy.mock.calls[0][0]).toEqual({
      user_id: "u1",
      author_name: "홍길동",
      author_field: "acting",
      type: "팁 공유",
      title: "제목",
      content: "본문",
    });
  });

  it("author_premium은 보내지 않는다 (서버에 컬럼 없음 — 보내면 insert 전체가 400)", async () => {
    mockInsertResults = [{ data: { id: "p1" }, error: null }];
    await createPost({ ...args, authorPremium: true });
    expect(mockInsertSpy.mock.calls[0][0]).not.toHaveProperty("author_premium");
  });

  it("분야가 없으면 author_field는 null", async () => {
    mockInsertResults = [{ data: { id: "p1" }, error: null }];
    await createPost({ ...args, authorField: undefined });
    expect(mockInsertSpy.mock.calls[0][0].author_field).toBeNull();
  });

  it("에러는 재시도 없이 그대로 던진다", async () => {
    mockInsertResults = [{ data: null, error: { code: "42501", message: "permission denied" } }];
    await expect(createPost(args)).rejects.toBeTruthy();
    expect(mockInsertSpy).toHaveBeenCalledTimes(1);
  });
});
