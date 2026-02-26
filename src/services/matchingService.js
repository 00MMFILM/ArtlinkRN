const SERVER_URL = "https://artlink-server.vercel.app";

// In-memory cache (10 min TTL)
let _cache = { data: null, ts: 0 };
const CACHE_TTL = 10 * 60 * 1000;

const EXPANDED_SAMPLE_PROJECTS = [
  // 프로젝트
  { id: "ai-1", source: "ai", sourcePlatform: "필름메이커스", tab: "프로젝트", title: "단편영화 '빛의 경계' 출연자 모집", field: "acting", description: "20대 여성 주연. 독립영화제 출품 예정 단편영화로, 경계인의 정체성을 탐구하는 작품입니다.", deadline: "2026-03-15", tags: ["독립영화", "주연", "정체성"], requirements: { gender: "female", ageRange: [20, 29], heightRange: [158, 172], specialties: [], location: "서울" } },
  { id: "ai-2", source: "ai", sourcePlatform: "플필", tab: "프로젝트", title: "뮤지컬 'Seasons' 앙상블 캐스팅", field: "music", description: "창작 뮤지컬 앙상블 캐스트. 노래와 연기를 동시에 소화할 수 있는 분을 찾습니다.", deadline: "2026-03-20", tags: ["뮤지컬", "앙상블", "보컬"], requirements: { ageRange: [20, 35], specialties: ["발레"], location: "" } },
  { id: "ai-3", source: "ai", sourcePlatform: "필름메이커스", tab: "프로젝트", title: "현대무용 페스티벌 참여 댄서 모집", field: "dance", description: "서울 현대무용 페스티벌 2026. 솔로 또는 듀엣 작품 참여자를 모집합니다.", deadline: "2026-04-10", tags: ["현대무용", "페스티벌", "솔로"], requirements: { heightRange: [165, 185], specialties: ["발레"], location: "서울" } },
  { id: "ai-4", source: "ai", sourcePlatform: "플필", tab: "프로젝트", title: "문예지 '새로운 문장' 신인 작가 공모", field: "literature", description: "소설 또는 시 부문. 등단 경력 없는 신인 작가를 위한 공모전입니다.", deadline: "2026-04-15", tags: ["소설", "시", "공모전", "신인"], requirements: {} },
  { id: "ai-5", source: "ai", sourcePlatform: "필름메이커스", tab: "프로젝트", title: "미디어 아트 전시 참여 작가 모집", field: "art", description: "디지털 미디어를 활용한 인터랙티브 전시. 신진 작가 우대.", deadline: "2026-03-30", tags: ["미디어아트", "전시", "디지털"], requirements: {} },
  { id: "ai-6", source: "ai", sourcePlatform: "플필", tab: "프로젝트", title: "장편영화 '여름의 끝' 스태프 모집", field: "film", description: "독립 장편영화 촬영 스태프. 조명, 녹음, 연출부 모집.", deadline: "2026-04-05", tags: ["장편영화", "스태프", "독립영화"], requirements: { location: "서울" } },
  { id: "ai-7", source: "ai", sourcePlatform: "필름메이커스", tab: "프로젝트", title: "음악극 '달빛 소나타' 배우 모집", field: "music", description: "피아노 연주와 연기를 병행하는 1인극. 클래식 음악 소양 필수.", deadline: "2026-04-20", tags: ["음악극", "1인극", "클래식"], requirements: { specialties: ["피아노"] } },
  // 오디션
  { id: "ai-8", source: "ai", sourcePlatform: "필름메이커스", tab: "오디션", title: "드라마 '새벽의 문' 공개 오디션", field: "acting", description: "OTT 오리지널 드라마. 다양한 연령대의 조연 역할 다수 오디션 진행 중.", deadline: "2026-03-10", tags: ["드라마", "OTT", "조연"], requirements: { ageRange: [20, 45], location: "서울" } },
  { id: "ai-9", source: "ai", sourcePlatform: "플필", tab: "오디션", title: "국립무용단 시즌 단원 오디션", field: "dance", description: "2026 시즌 객원 단원 모집. 현대무용 경력 2년 이상 우대.", deadline: "2026-04-01", tags: ["국립무용단", "현대무용", "객원"], requirements: { heightRange: [165, 185] } },
  { id: "ai-10", source: "ai", sourcePlatform: "필름메이커스", tab: "오디션", title: "뮤직비디오 보컬리스트 오디션", field: "music", description: "K-POP 아티스트 뮤직비디오 피처링. 독특한 음색의 보컬리스트를 찾습니다.", deadline: "2026-03-18", tags: ["뮤직비디오", "보컬", "K-POP"], requirements: { ageRange: [18, 30] } },
  { id: "ai-11", source: "ai", sourcePlatform: "플필", tab: "오디션", title: "장편영화 '거울' 배우 캐스팅", field: "film", description: "심리 스릴러 장편영화. 20-30대 남녀 배우 오디션 진행.", deadline: "2026-03-25", tags: ["장편영화", "스릴러", "캐스팅"], requirements: { ageRange: [20, 39], gender: "male" } },
  { id: "ai-12", source: "ai", sourcePlatform: "필름메이커스", tab: "오디션", title: "웹소설 원작 드라마 성우 오디션", field: "acting", description: "인기 웹소설 드라마화 프로젝트. 보이스 연기에 자신 있는 분 지원 가능.", deadline: "2026-04-05", tags: ["성우", "웹소설", "보이스"] },
  { id: "ai-13", source: "ai", sourcePlatform: "플필", tab: "오디션", title: "현대미술 갤러리 레지던시 오디션", field: "art", description: "3개월 레지던시 프로그램. 신진 작가 대상 포트폴리오 심사.", deadline: "2026-04-12", tags: ["레지던시", "갤러리", "신진작가"] },
  { id: "ai-14", source: "ai", sourcePlatform: "필름메이커스", tab: "오디션", title: "문학잡지 신인상 공모", field: "literature", description: "계간 문학잡지 신인상. 단편소설 또는 시 10편 이상 응모 가능.", deadline: "2026-04-18", tags: ["신인상", "문학잡지", "공모"] },
  // 콜라보
  { id: "ai-15", source: "ai", sourcePlatform: "플필", tab: "콜라보", title: "시각예술 x 음악 융합 전시 참여자", field: "art", description: "인터랙티브 미디어 전시 프로젝트. 미술과 음악의 경계를 허무는 실험적 작업.", deadline: "2026-03-25", tags: ["융합", "인터랙티브", "실험"] },
  { id: "ai-16", source: "ai", sourcePlatform: "필름메이커스", tab: "콜라보", title: "무용 x 영상 콜라보 프로젝트", field: "dance", description: "무용 퍼포먼스를 영상으로 기록하는 콜라보. 무용수와 영상 감독 모두 환영.", deadline: "2026-04-20", tags: ["무용", "영상", "퍼포먼스"] },
  { id: "ai-17", source: "ai", sourcePlatform: "플필", tab: "콜라보", title: "시낭독 x 음악 공연 참여자", field: "literature", description: "시인과 음악가가 함께하는 라이브 공연. 독립 공간에서 진행.", deadline: "2026-04-08", tags: ["시낭독", "라이브", "독립공연"] },
  { id: "ai-18", source: "ai", sourcePlatform: "필름메이커스", tab: "콜라보", title: "단편영화 x 연극 크로스오버", field: "film", description: "연극적 미장센을 영화로 옮기는 실험 프로젝트. 연기자, 연출자 모집.", deadline: "2026-04-12", tags: ["크로스오버", "연극", "실험영화"] },
  { id: "ai-19", source: "ai", sourcePlatform: "플필", tab: "콜라보", title: "AI x 미술 협업 프로젝트", field: "art", description: "AI 생성 이미지와 전통 미술 기법을 결합한 전시. 디지털 아티스트 모집.", deadline: "2026-04-18", tags: ["AI", "디지털아트", "전시"] },
  { id: "ai-20", source: "ai", sourcePlatform: "필름메이커스", tab: "콜라보", title: "연기 x 무용 퍼포먼스 프로젝트", field: "acting", description: "피지컬 시어터 기반 융합 공연. 연기자와 무용수가 함께 만드는 무대.", deadline: "2026-04-25", tags: ["피지컬시어터", "융합", "공연"] },
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
    // Fallback to expanded sample data
    _cache = { data: EXPANDED_SAMPLE_PROJECTS, ts: Date.now() };
    return EXPANDED_SAMPLE_PROJECTS;
  }
}
