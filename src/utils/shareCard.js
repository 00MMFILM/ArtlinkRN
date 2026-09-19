import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import i18n from "../i18n";

// 분야별 뱃지(이모지)와 카드 상단 분석 항목 칩. 라벨은 기존 fields.* 번역 키를 쓴다.
export const FIELD_META = {
  acting: { emoji: "🎭", label: "연기" },
  music: { emoji: "🎵", label: "음악" },
  dance: { emoji: "💃", label: "무용" },
  art: { emoji: "🎨", label: "미술" },
  film: { emoji: "🎬", label: "영화" },
  literature: { emoji: "✍️", label: "문학" },
  general: { emoji: "✨", label: "기록" },
};

const FIELD_CHIPS = {
  acting: ["감정 레이어", "서브텍스트", "호흡·템포", "신체 정렬", "음성 프로소디", "비트 전환"],
  music: ["음정", "리듬·템포", "다이내믹", "음색", "프레이징", "호흡·발성"],
  dance: ["코어", "공간 활용", "무게 이동", "음악 싱크", "표현력", "호흡"],
  art: ["구도", "색채", "명암", "질감", "시선 유도", "여백"],
  film: ["앵글", "조명", "편집 리듬", "사운드", "서사", "색보정"],
  literature: ["서사", "캐릭터", "문체", "시점", "은유", "리듬"],
  general: ["구체성", "관찰", "목표 설정", "성장 포인트"],
};

const SECTION_RE = /([📌💪🎯🎭🎨💡📈🔜🎤])\s*([\s\S]*?)(?=[📌💪🎯🎭🎨💡📈🔜🎤]|$)/gu;

// aiComment(이모지 섹션 텍스트)에서 관찰/강점/제안 뽑기
function parseSections(text) {
  const map = {};
  let m;
  SECTION_RE.lastIndex = 0;
  while ((m = SECTION_RE.exec(text || ""))) map[m[1]] = (m[2] || "").trim();
  return { observation: map["📌"] || "", strength: map["💪"] || "", nextStep: map["🎯"] || "" };
}

function truncate(s, n) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).trim() + "…" : t;
}

// 노트 → 카드 컴포넌트 props (feed=2블록, story=3블록)
export function buildCardProps(note, variant) {
  const meta = FIELD_META[note.field] || FIELD_META.general;
  const fieldLabel = i18n.t(`fields.${note.field}`, { defaultValue: meta.label });
  const s = parseSections(note.aiComment);
  const chips = (FIELD_CHIPS[note.field] || FIELD_CHIPS.general).slice(0, variant === "story" ? 6 : 5);
  const B_OBS = { h: i18n.t("shareCard.section_observation"), b: truncate(s.observation, variant === "story" ? 120 : 95) };
  const B_STR = { h: i18n.t("shareCard.section_strength"), b: truncate(s.strength, 110) };
  const B_NEXT = { h: i18n.t("shareCard.section_next"), b: truncate(s.nextStep, variant === "story" ? 120 : 95) };
  const blocks = variant === "story" ? [B_OBS, B_STR, B_NEXT] : [B_OBS, B_NEXT];
  const now = new Date();
  const practiceTitle = i18n.t("shareCard.practice_title", { field: fieldLabel });
  return {
    variant,
    fieldEmoji: meta.emoji,
    fieldLabel,
    dateLabel: now.toLocaleDateString(i18n.language, { month: "long", day: "numeric" }),
    title: note.title || practiceTitle,
    subtitle: note.title ? practiceTitle : "",
    chips,
    blocks: blocks.filter((b) => b.b), // 내용 없는 섹션 제외
  };
}

// 카드 View ref를 이미지로 캡처 → 공유 시트 (인스타·스레드·틱톡). 앨범 저장은 권한 이슈로 미사용.
export async function shareCardImage(ref, variant) {
  // "auto"는 뷰의 실제 크기대로 캡처한다 — 고정 비율이 아닌 카드에 1080×1350을 강제하면 찌그러진다
  const size = variant === "auto" ? {} : { width: 1080, height: variant === "story" ? 1920 : 1350 };
  const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile", ...size });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "피드백 공유" });
    return { shared: true };
  }
  return { shared: false, reason: "unavailable", uri };
}
