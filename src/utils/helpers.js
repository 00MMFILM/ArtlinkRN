import { FIELD_LABELS, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";

export const getFieldLabel = (field) => FIELD_LABELS[field] || field;
export const getFieldEmoji = (field) => FIELD_EMOJIS[field] || "📝";
export const getFieldColor = (field) => FIELD_COLORS[field] || "#8E8E93";

export const FIELDS = ["acting", "music", "art", "dance", "literature", "film"];

export const USER_TYPES = [
  { key: "professional", label: "현직 아티스트", desc: "현재 활동 중인 전문 아티스트" },
  { key: "aspiring", label: "지망생", desc: "아티스트를 꿈꾸는 학생/준비생" },
  { key: "hobby", label: "취미", desc: "취미로 예술 활동을 즐기는 분" },
  { key: "industry", label: "업계 관계자", desc: "기획사, 프로덕션, 교육 등 업계 종사자" },
];

export const ROLE_MODELS_BY_FIELD = {
  acting: ["송강호", "전도연", "이병헌", "김혜수", "유아인", "한소희", "Robert De Niro", "Meryl Streep", "Cate Blanchett"],
  music: ["BTS", "아이유", "박효신", "이소라", "Billie Eilish", "Adele", "Jacob Collier"],
  art: ["이우환", "김환기", "박서보", "쿠사마 야요이", "Banksy", "David Hockney"],
  dance: ["박재림", "황수현", "Akram Khan", "Pina Bausch", "Martha Graham"],
  literature: ["한강", "김영하", "은희경", "무라카미 하루키", "Kazuo Ishiguro"],
  film: ["봉준호", "박찬욱", "이창동", "고레에다 히로카즈", "Christopher Nolan"],
};

export const INTERESTS_BY_FIELD = {
  acting: ["방법연기", "즉흥연기", "뮤지컬", "보이스", "모션캡처", "오디션", "자기테이프", "장면분석"],
  music: ["작곡", "편곡", "보컬", "악기연주", "프로듀싱", "라이브", "음악이론", "사운드디자인"],
  art: ["유화", "수채화", "디지털아트", "조각", "설치미술", "사진", "일러스트", "판화"],
  dance: ["현대무용", "발레", "한국무용", "스트릿댄스", "안무", "즉흥", "컨택", "라반분석"],
  literature: ["소설", "시", "에세이", "시나리오", "비평", "번역", "창작교실", "문학이론"],
  film: ["연출", "촬영", "편집", "시나리오", "프로덕션", "다큐멘터리", "실험영화", "VFX"],
};

export function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function truncate(str, maxLen = 100) {
  if (!str || str.length <= maxLen) return str || "";
  return str.slice(0, maxLen - 1) + "…";
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
