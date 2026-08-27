import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

// 분야별 뱃지(이모지+라벨)와 카드 상단 분석 항목 칩
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
  const s = parseSections(note.aiComment);
  const chips = (FIELD_CHIPS[note.field] || FIELD_CHIPS.general).slice(0, variant === "story" ? 6 : 5);
  const B_OBS = { h: "📌 AI가 본 것", b: truncate(s.observation, variant === "story" ? 120 : 95) };
  const B_STR = { h: "💪 잘한 점", b: truncate(s.strength, 110) };
  const B_NEXT = { h: "🎯 다음 스텝", b: truncate(s.nextStep, variant === "story" ? 120 : 95) };
  const blocks = variant === "story" ? [B_OBS, B_STR, B_NEXT] : [B_OBS, B_NEXT];
  const now = new Date();
  return {
    variant,
    fieldEmoji: meta.emoji,
    fieldLabel: meta.label,
    dateLabel: `${now.getMonth() + 1}월 ${now.getDate()}일`,
    title: note.title || `${meta.label} 연습`,
    subtitle: note.title ? `${meta.label} 연습` : "",
    chips,
    blocks: blocks.filter((b) => b.b), // 내용 없는 섹션 제외
  };
}

// 카드 View ref를 이미지로 캡처 → 공유 시트 (인스타·스레드·틱톡). 앨범 저장은 권한 이슈로 미사용.
export async function shareCardImage(ref, variant) {
  const width = 1080;
  const height = variant === "story" ? 1920 : 1350;
  const uri = await captureRef(ref, { format: "png", quality: 1, width, height, result: "tmpfile" });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "피드백 공유" });
    return { shared: true };
  }
  return { shared: false, uri };
}
