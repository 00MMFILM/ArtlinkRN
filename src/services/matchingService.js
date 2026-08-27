import { MATCHING_SERVER_URL, getApiHeaders } from "./apiConfig";
import { supabase } from "./supabaseClient";

// In-memory cache (10 min TTL)
let _cache = { data: null, ts: 0 };
const CACHE_TTL = 10 * 60 * 1000;

const FALLBACK_SAMPLE_PROJECTS = [
  { id: "fb-1", source: "ai", sourcePlatform: "AI수집", tab: "프로젝트", title: "단편영화 출연자 모집", field: "acting", description: "20대 여성 주연. 독립영화제 출품 예정 단편영화.", deadline: "2026-03-15", tags: ["독립영화", "주연"], requirements: { gender: "female", ageRange: [20, 29], location: "서울" } },
  { id: "fb-2", source: "ai", sourcePlatform: "AI수집", tab: "프로젝트", title: "뮤지컬 앙상블 캐스팅", field: "music", description: "창작 뮤지컬 앙상블 캐스트. 노래와 연기를 동시에 소화할 수 있는 분.", deadline: "2026-03-20", tags: ["뮤지컬", "앙상블", "보컬"], requirements: { ageRange: [20, 35] } },
  { id: "fb-3", source: "ai", sourcePlatform: "AI수집", tab: "프로젝트", title: "현대무용 페스티벌 참여 댄서 모집", field: "dance", description: "서울 현대무용 페스티벌. 솔로 또는 듀엣 작품 참여자 모집.", deadline: "2026-04-10", tags: ["현대무용", "페스티벌"], requirements: { location: "서울" } },
  { id: "fb-4", source: "ai", sourcePlatform: "AI수집", tab: "오디션", title: "드라마 공개 오디션", field: "acting", description: "OTT 오리지널 드라마. 다양한 연령대의 조연 역할 오디션.", deadline: "2026-03-25", tags: ["드라마", "OTT", "조연"], requirements: { ageRange: [20, 45], location: "서울" } },
  { id: "fb-5", source: "ai", sourcePlatform: "AI수집", tab: "오디션", title: "장편영화 배우 캐스팅", field: "film", description: "심리 스릴러 장편영화. 20-30대 남녀 배우 오디션.", deadline: "2026-03-25", tags: ["장편영화", "캐스팅"], requirements: { ageRange: [20, 39] } },
  { id: "fb-6", source: "ai", sourcePlatform: "AI수집", tab: "콜라보", title: "무용 x 영상 콜라보 프로젝트", field: "dance", description: "무용 퍼포먼스를 영상으로 기록하는 콜라보.", deadline: "2026-04-20", tags: ["무용", "영상", "퍼포먼스"] },
];

/**
 * 사용자가 작성한 매칭 공고를 서버(matching_posts)에 저장.
 * 스키마 정본은 작성화면(MatchingPostCreateScreen)이 넘기는 키 — requirements.
 * 테이블/RLS 미적용 환경에서는 throw 되므로 호출부에서 삼켜야 한다(로컬 저장은 유지).
 * 마이그레이션: sql/matching_posts.sql
 */
export async function createMatchingPost(post) {
  const { data, error } = await supabase
    .from("matching_posts")
    .insert({
      user_id: post.userId || null,
      auth_user_id: post.authUserId || null,
      local_id: post.localId ?? null,
      author_name: post.authorName || null,
      author_field: post.authorField || null,
      tab: post.tab || "프로젝트",
      title: post.title,
      field: post.field || null,
      description: post.description || "",
      deadline: post.deadline || null,
      tags: post.tags || [],
      contact: post.contact || null,
      requirements: post.requirements || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 서버 row(matching_posts) → 매칭 화면/상세가 기대하는 형태.
 * title/description은 화면에서 미보호 접근(toLowerCase 등)하므로 빈 문자열 기본값 보장.
 */
export function normalizeServerMatchingPost(row) {
  return {
    id: row.local_id ?? row.id,
    serverId: row.id,
    source: "user",
    tab: row.tab || "프로젝트",
    title: row.title || "",
    field: row.field || "etc",
    description: row.description || "",
    deadline: row.deadline || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    contact: row.contact || null,
    requirements: row.requirements || {},
    authorName: row.author_name || null,
    authorField: row.author_field || null,
    createdAt: row.created_at || null,
    authUserId: row.auth_user_id || null,
  };
}

/**
 * 서버 공고 + 내 로컬 공고 병합.
 * 서버 목록이 기본이고, 서버에 없는(=local_id 매칭 실패) 내 로컬 공고만 덧붙인다.
 * (서버 저장이 실패했던 내 글 보존 — createMatchingPost는 실패해도 삼켜진다)
 * deletedIds: 내가 지운 공고의 local id 툼스톤. 서버 삭제가 실패해도(익명 공고·네트워크)
 * 병합 결과에서 걸러내 다시 나타나지 않게 한다.
 */
export function mergeUserMatchingPosts(localPosts = [], serverPosts = [], deletedIds = []) {
  const server = Array.isArray(serverPosts) ? serverPosts : [];
  const local = Array.isArray(localPosts) ? localPosts : [];
  const deleted = new Set((Array.isArray(deletedIds) ? deletedIds : []).map(Number));
  const serverLocalIds = new Set(
    server.map((p) => Number(p.id)).filter((n) => Number.isFinite(n))
  );
  const localOnly = local.filter((p) => !serverLocalIds.has(Number(p.id)));
  return [...server, ...localOnly]
    .filter((p) => !deleted.has(Number(p.id)))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/**
 * 내 매칭 공고를 서버에서 삭제(local_id 기준). RLS가 auth_user_id = auth.uid() 작성자만
 * 허용하므로 추가 필터는 불필요. 익명 공고·네트워크 실패는 베스트에포트 — 호출부에서 삼킨다.
 */
export async function deleteMatchingPost(localId) {
  const { error } = await supabase.from("matching_posts").delete().eq("local_id", localId);
  if (error) throw error;
}

/**
 * 다른 사용자가 올린 공고까지 포함해 서버 공고를 읽어온다.
 * 실패(테이블 미존재·RLS·네트워크)해도 절대 throw 하지 않고 빈 배열 → 로컬만 표시(회귀 없음).
 */
export async function fetchUserMatchingPosts() {
  try {
    const { data, error } = await supabase
      .from("matching_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) return [];
    return data.map(normalizeServerMatchingPost);
  } catch {
    return [];
  }
}

export async function fetchMatchingFeed(userFields = []) {
  // Return cache if valid
  if (_cache.data && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.data;
  }

  try {
    // Fetch all pages to get full dataset
    let allItems = [];
    let page = 1;
    const limit = 50;
    while (true) {
      const res = await fetch(`${MATCHING_SERVER_URL}/api/matching-feed`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({ userFields, page, limit }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      allItems.push(...data);
      if (data.length < limit) break;
      page++;
      if (page > 10) break; // Safety cap: max 500 posts
    }

    if (allItems.length > 0) {
      const items = allItems.map((item) => ({
        source: "ai",
        tab: "프로젝트",
        requirements: {},
        tags: [],
        ...item,
      }));
      _cache = { data: items, ts: Date.now() };
      return items;
    }
    throw new Error("Empty response");
  } catch {
    // Fallback to sample data when server is unreachable
    _cache = { data: FALLBACK_SAMPLE_PROJECTS, ts: Date.now() };
    return FALLBACK_SAMPLE_PROJECTS;
  }
}
