import { MATCHING_SERVER_URL, getApiHeaders } from "./apiConfig";
import { supabase } from "./supabaseClient";

// In-memory cache (10 min TTL) — 성공(빈 응답 포함) 결과만 캐시한다. 실패는 캐시하지 않아
// 다음 진입 시 재시도된다(FALLBACK_SAMPLE_PROJECTS 제거에 따른 변경 — 실측 예시 공고가 실제
// 서버 공고처럼 보이는 문제 방지).
let _cache = { data: null, ts: 0 };
const CACHE_TTL = 10 * 60 * 1000;

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

/**
 * AI 매칭 공고 피드를 서버에서 읽어온다.
 * 반환 형태 { items, error } — 성공(빈 응답 포함) error:null, 실패 error:"network"|"http_<status>".
 * 실패 시 절대 예시 공고로 대체하지 않고(과거 FALLBACK_SAMPLE_PROJECTS 제거), 캐시에도 남기지
 * 않는다 — 다음 화면 진입에서 재시도되게 하기 위함. 호출부(MatchingScreen)는 error로 오류/빈
 * 목록 UI를 구분한다.
 */
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
      if (!res.ok) {
        // 실패 — 캐시하지 않고 그대로 반환(다음 진입 시 재시도)
        return { items: [], error: `http_${res.status}` };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      allItems.push(...data);
      if (data.length < limit) break;
      page++;
      if (page > 10) break; // Safety cap: max 500 posts
    }

    const items = allItems.map((item) => ({
      source: "ai",
      tab: "프로젝트",
      requirements: {},
      tags: [],
      ...item,
    }));
    const result = { items, error: null };
    _cache = { data: result, ts: Date.now() };
    return result;
  } catch {
    // 네트워크 실패 — 캐시하지 않고 그대로 반환(다음 진입 시 재시도)
    return { items: [], error: "network" };
  }
}
