const SERVER_URL = "https://artlink-server.vercel.app";

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

export async function fetchMatchingFeed(userFields = []) {
  // Return cache if valid
  if (_cache.data && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.data;
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/matching-feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userFields }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      // Ensure all items have source: "ai" and required fields
      const items = data.map((item) => ({
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
