import { MATCHING_SERVER_URL, getApiHeaders } from "./apiConfig";
import { rawStorageForScope, getStorageScope, withStorageLock } from "../utils/accountStorage";
import { opportunityKey } from "../utils/opportunities";

export const OPPORTUNITY_SAVED_KEY = "artlink-opportunity-saved-v1";
export const OPPORTUNITY_PAGE_SIZE = 30;

// Existing endpoint accepts page/limit/field/tab and returns an array. Load one
// page per request, never prefetch the old 500-post maximum on screen entry.
export async function fetchOpportunityPage({ page = 1, field = "all", category = "all" } = {}) {
  try {
    const res = await fetch(`${MATCHING_SERVER_URL}/api/matching-feed`, {
      method: "POST", headers: getApiHeaders(),
      body: JSON.stringify({ page, limit: OPPORTUNITY_PAGE_SIZE,
        ...(field !== "all" ? { field } : {}), ...(category !== "all" ? { tab: category } : {}) }),
    });
    if (!res.ok) return { items: [], hasMore: false, error: `http_${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data)) return { items: [], hasMore: false, error: "invalid_response" };
    const items = data.filter((item) => item && item.id != null).map((item) => ({
      tab: "프로젝트", requirements: {}, tags: [], ...item, source: "ai",
    }));
    return { items, hasMore: data.length >= OPPORTUNITY_PAGE_SIZE, error: null };
  } catch { return { items: [], hasMore: false, error: "network" }; }
}

export async function loadSavedOpportunities(scope = getStorageScope()) {
  if (!scope) return [];
  const raw = await rawStorageForScope(scope).getItem(OPPORTUNITY_SAVED_KEY);
  if (!raw) return [];
  const rows = JSON.parse(raw);
  return Array.isArray(rows) ? rows.filter((row) => row?.post?.id != null) : [];
}

export function setOpportunitySaved(post, saved, scope = getStorageScope()) {
  if (!scope) return Promise.reject(new Error("ACCOUNT_NOT_READY"));
  return withStorageLock(OPPORTUNITY_SAVED_KEY, scope, async () => {
    const previous = await loadSavedOpportunities(scope);
    const key = opportunityKey(post);
    const rows = previous.filter((row) => opportunityKey(row.post) !== key);
    if (saved) rows.unshift({ post, savedAt: new Date().toISOString() });
    const storage = rawStorageForScope(scope), raw = JSON.stringify(rows);
    await storage.setItem(OPPORTUNITY_SAVED_KEY, raw);
    if (await storage.getItem(OPPORTUNITY_SAVED_KEY) !== raw) throw new Error("LOCAL_STORAGE_WRITE_FAILED");
    return rows;
  });
}
