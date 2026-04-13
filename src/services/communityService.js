import { supabase } from "./supabaseClient";

const SERVER_URL = "https://artlink-server.vercel.app";

// ─── Cache ──────────────────────────────────────────────────
let postsCache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isCacheValid() {
  return postsCache.data && Date.now() - postsCache.ts < CACHE_TTL;
}

export function invalidatePostsCache() {
  postsCache = { data: null, ts: 0 };
}

// ─── Demo fallback data ─────────────────────────────────────
const DEMO_POSTS = [
  {
    id: "demo-1",
    author_name: "연기하는 민수",
    author_field: "acting",
    type: "팁 공유",
    title: "셀프테이프 조명 세팅 공유합니다",
    content: "자연광 + 링라이트 조합이 가장 자연스러워요. 색온도 4000K 정도가 피부톤이 제일 잘 나옵니다.",
    likes_count: 24,
    comments_count: 8,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-2",
    author_name: "재즈피아니스트 윤아",
    author_field: "music",
    type: "작품 공유",
    title: "즉흥 연주 세션 녹음",
    content: "Miles Davis 트리뷰트 세션에서 연주한 곡입니다. 피드백 부탁드려요!",
    likes_count: 31,
    comments_count: 12,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-3",
    author_name: "무용가 지현",
    author_field: "dance",
    type: "질문",
    title: "컨템포러리 워크숍 추천해주세요",
    content: "서울 근처 주말 워크숍 찾고 있어요. 초중급 레벨이에요.",
    likes_count: 15,
    comments_count: 22,
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-4",
    author_name: "일러스트 소영",
    author_field: "art",
    type: "콜라보",
    title: "뮤지션과 앨범 아트 콜라보 원해요",
    content: "포트폴리오 보시고 관심있으시면 연락주세요!",
    likes_count: 42,
    comments_count: 6,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const DEMO_COMMENTS = {
  "demo-1": [
    { id: "dc1", author_name: "보컬트레이너 하은", author_field: "music", content: "링라이트 추천 제품 있으시면 알려주세요!", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    { id: "dc2", author_name: "배우 준혁", author_field: "acting", content: "저도 이 세팅 쓰는데 정말 좋아요. 색온도 4000K가 최고입니다", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
  ],
  "demo-2": [
    { id: "dc3", author_name: "드러머 태양", author_field: "music", content: "세션 영상도 올려주시면 좋겠어요!", created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
  ],
  "demo-3": [
    { id: "dc4", author_name: "무용가 수빈", author_field: "dance", content: "서울무용센터 주말 워크숍 추천드려요", created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  ],
  "demo-4": [
    { id: "dc5", author_name: "싱어송라이터 도윤", author_field: "music", content: "포트폴리오 보고 연락드릴게요! 앨범 작업 중입니다", created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  ],
};

// ─── User ───────────────────────────────────────────────────
export async function ensureDeviceUser(deviceId, displayName, field, authUserId) {
  // If auth user ID provided, try to find existing user by it (cross-device reconnect)
  if (authUserId) {
    const { data: byAuth } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .single();

    if (byAuth) return byAuth.id;
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("device_id", deviceId)
    .single();

  if (existing) {
    // Link auth_user_id if not yet set
    if (authUserId) {
      await supabase
        .from("users")
        .update({ auth_user_id: authUserId })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      device_id: deviceId,
      display_name: displayName || "익명",
      field: field || null,
      auth_user_id: authUserId || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

// ─── Posts ───────────────────────────────────────────────────
export async function fetchPosts(type) {
  if (isCacheValid() && !type) return postsCache.data;

  let query = supabase
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (type && type !== "전체") {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (!type || type === "전체") {
    postsCache = { data, ts: Date.now() };
  }

  return data;
}

export async function createPost({ userId, authorName, authorField, type, title, content }) {
  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: userId,
      author_name: authorName,
      author_field: authorField || null,
      type,
      title,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  invalidatePostsCache();
  return data;
}

export async function deletePost(postId, userId) {
  const { error } = await supabase
    .from("community_posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);

  if (error) throw error;
  invalidatePostsCache();
}

// ─── Comments ───────────────────────────────────────────────
export async function fetchComments(postId) {
  const { data, error } = await supabase
    .from("community_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createComment({ postId, userId, authorName, authorField, content }) {
  const { data, error } = await supabase
    .from("community_comments")
    .insert({
      post_id: postId,
      user_id: userId,
      author_name: authorName,
      author_field: authorField || null,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Likes ──────────────────────────────────────────────────
export async function checkLiked(postId, userId) {
  const { data } = await supabase
    .from("community_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .single();

  return !!data;
}

export async function toggleLike(postId, userId) {
  const { data: existing } = await supabase
    .from("community_likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    await supabase.from("community_likes").delete().eq("id", existing.id);
    return false; // unliked
  } else {
    const { error } = await supabase
      .from("community_likes")
      .insert({ post_id: postId, user_id: userId });
    if (error) throw error;
    return true; // liked
  }
}

// ─── AI Moderation ──────────────────────────────────────────
export async function moderateContent(content, type = "post") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${SERVER_URL}/api/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, type }),
      signal: controller.signal,
    });
    if (!res.ok) return { safe: true };
    const json = await res.json();
    // Validate response shape — missing safe field → fail-open
    if (typeof json.safe !== "boolean") return { safe: true };
    return json;
  } catch (_) {
    // Fail-open: network/timeout error → allow content (profanity filter is Layer 1)
    return { safe: true };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fallback helpers ───────────────────────────────────────
export function getDemoPosts() {
  return DEMO_POSTS;
}

export function getDemoComments(postId) {
  return DEMO_COMMENTS[postId] || [];
}
