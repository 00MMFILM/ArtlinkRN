import i18n from "i18next";
import { FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";

export const getFieldLabel = (field) => i18n.t(`fields.${field}`, { defaultValue: field });
export const getFieldEmoji = (field) => FIELD_EMOJIS[field] || "📝";
export const getFieldColor = (field) => FIELD_COLORS[field] || "#8E8E93";

export const FIELDS = ["acting", "music", "art", "dance", "literature", "film", "etc"];

// ─── Profile Constants (use labelKey for i18n) ───

export const GENDER_OPTIONS = [
  { key: "male", labelKey: "gender.male" },
  { key: "female", labelKey: "gender.female" },
  { key: "other", labelKey: "gender.other" },
];

export const SPECIALTY_SUGGESTIONS = [
  "검도", "수영", "영어", "피아노", "승마", "태권도", "발레",
  "일본어", "중국어", "기타연주", "드럼", "요가", "필라테스",
  "복싱", "사격", "스키", "서핑", "스케이트보드", "자전거",
  "요리", "운전", "오토바이", "다이빙", "클라이밍", "합기도",
];

export const CAREER_TYPES = [
  { key: "drama", labelKey: "careerTypes.drama" },
  { key: "film", labelKey: "careerTypes.film" },
  { key: "theater", labelKey: "careerTypes.theater" },
  { key: "musical", labelKey: "careerTypes.musical" },
  { key: "commercial", labelKey: "careerTypes.commercial" },
  { key: "music_video", labelKey: "careerTypes.music_video" },
  { key: "web_drama", labelKey: "careerTypes.web_drama" },
  { key: "short_film", labelKey: "careerTypes.short_film" },
  { key: "variety", labelKey: "careerTypes.variety" },
  { key: "other", labelKey: "careerTypes.other" },
];

export function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}

// ─── Feature Access (all features free) ───

export function canUseFeature() {
  return true;
}

export const USER_TYPES = [
  { key: "professional", labelKey: "userTypes.professional", descKey: "userTypes.professional_desc" },
  { key: "aspiring", labelKey: "userTypes.aspiring", descKey: "userTypes.aspiring_desc" },
  { key: "hobby", labelKey: "userTypes.hobby", descKey: "userTypes.hobby_desc" },
  { key: "industry", labelKey: "userTypes.industry", descKey: "userTypes.industry_desc" },
  { key: "fan", labelKey: "userTypes.fan", descKey: "userTypes.fan_desc" },
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
  acting: ["방법연기", "즉흥연기", "뮤지컬", "보이스", "모션캡처", "오디션", "셀프테이프", "장면분석"],
  music: ["작곡", "편곡", "보컬", "악기연주", "프로듀싱", "라이브", "음악이론", "사운드디자인"],
  art: ["유화", "수채화", "디지털아트", "조각", "설치미술", "사진", "일러스트", "판화"],
  dance: ["현대무용", "발레", "한국무용", "스트릿댄스", "안무", "즉흥", "컨택", "라반분석"],
  literature: ["소설", "시", "에세이", "시나리오", "비평", "번역", "창작교실", "문학이론"],
  film: ["연출", "촬영", "편집", "시나리오", "프로덕션", "다큐멘터리", "실험영화", "VFX"],
};

// ─── Locale-aware date/time helpers ───

const LOCALE_MAP = {
  ko: "ko-KR", en: "en-US", ja: "ja-JP",
  "zh-CN": "zh-CN", "zh-TW": "zh-TW",
  vi: "vi-VN", th: "th-TH", id: "id-ID",
  ar: "ar-SA", es: "es-ES",
};

function getLocale() {
  return LOCALE_MAP[i18n.language] || "en-US";
}

export function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return i18n.t("common.just_now");
  if (diff < 3600) return i18n.t("common.mins_ago", { count: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t("common.hours_ago", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return i18n.t("common.days_ago", { count: Math.floor(diff / 86400) });
  return date.toLocaleDateString(getLocale(), { month: "short", day: "numeric" });
}

export function truncate(str, maxLen = 100) {
  if (!str || str.length <= maxLen) return str || "";
  return str.slice(0, maxLen - 1) + "…";
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(getLocale(), {
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
