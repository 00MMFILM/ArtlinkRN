import { FIELD_LABELS } from "../constants/theme";

const SERVER_URL = "https://artlink-server.vercel.app";

const FIELD_AI_PROMPTS = {
  acting: {
    system: `당신은 ArtLink의 연기 전문 AI 코치입니다. 스타니슬랍스키 시스템과 마이즈너 테크닉에 기반한 분석을 합니다.
분석 관점: 감정 진실성, 서브텍스트 깊이, 비트 전환, 신체적 표현, 호흡과 템포.`,
    keywords: ["감정곡선", "서브텍스트", "비트", "호흡", "캐릭터", "내면작업"],
  },
  music: {
    system: `당신은 ArtLink의 음악 전문 AI 코치입니다. 음악 이론과 연주/보컬 테크닉에 기반한 분석을 합니다.
분석 관점: 음정 정확도, 리듬/템포 일관성, 다이내믹 레인지, 음색 표현, 프레이징.`,
    keywords: ["음정", "리듬", "BPM", "다이내믹", "프레이징", "음색"],
  },
  art: {
    system: `당신은 ArtLink의 미술 전문 AI 코치입니다. 미술사적 관점과 실기 테크닉에 기반한 분석을 합니다.
분석 관점: 구도와 시선 유도, 색채 조화, 질감 표현, 명암 대비, 작가적 의도.`,
    keywords: ["구도", "색채", "질감", "명암", "톤", "터치"],
  },
  dance: {
    system: `당신은 ArtLink의 무용 전문 AI 코치입니다. 라반 움직임 분석(LMA)에 기반한 분석을 합니다.
분석 관점: 코어 안정성, 공간 활용, 무게 이동, 음악과의 싱크, 감정 전달력.`,
    keywords: ["코어", "밸런스", "공간", "플로어", "시퀀스", "표현"],
  },
  film: {
    system: `당신은 ArtLink의 영화/영상 전문 AI 코치입니다. 시네마토그래피와 스토리텔링에 기반한 분석을 합니다.
분석 관점: 카메라 앵글, 조명 설계, 편집 리듬, 사운드 디자인, 서사 구조.`,
    keywords: ["앵글", "조명", "편집", "숏", "씬", "서사"],
  },
  literature: {
    system: `당신은 ArtLink의 문학 전문 AI 코치입니다. 문학 비평과 창작 기법에 기반한 분석을 합니다.
분석 관점: 서사 구조, 캐릭터 입체성, 문체와 톤, 은유/상징, 독자 몰입도.`,
    keywords: ["서사", "캐릭터", "문체", "은유", "시점", "갈등"],
  },
};

function buildAIPrompt(field, content, savedNotes = [], currentNote = null, userProfile = {}) {
  const fieldConfig = FIELD_AI_PROMPTS[field] || FIELD_AI_PROMPTS.acting;
  const fieldLabel = FIELD_LABELS[field] || "예술";

  const sameFieldNotes = savedNotes.filter((n) => n.field === field && n.aiComment).slice(0, 5);
  const historyContext = sameFieldNotes.length > 0
    ? `\n[이전 ${fieldLabel} 피드백 히스토리]\n${sameFieldNotes.map((n, i) => `${i + 1}. ${(n.aiComment || "").slice(0, 200)}`).join("\n")}`
    : "";

  const personalContext = userProfile.roleModels?.length
    ? `\n[사용자 롤모델: ${userProfile.roleModels.join(", ")}]`
    : "";

  const interestContext = userProfile.interests?.length
    ? `\n[관심 분야: ${userProfile.interests.join(", ")}]`
    : "";

  const careerContext = userProfile.career?.length
    ? `\n[경력: ${userProfile.career.slice(0, 5).map((c) => `${c.title}(${c.role})`).join(", ")}]`
    : "";

  const specialtyContext = userProfile.specialties?.length
    ? `\n[특기: ${userProfile.specialties.join(", ")}]`
    : "";

  // Media metadata context
  const images = currentNote?.images || [];
  const voices = currentNote?.voiceRecordings || [];
  const photoCount = images.filter((i) => i.type !== "video").length;
  const videoCount = images.filter((i) => i.type === "video").length;
  const voiceCount = voices.length;
  const mediaParts = [];
  if (photoCount > 0) mediaParts.push(`사진 ${photoCount}장 첨부`);
  if (videoCount > 0) mediaParts.push(`영상 ${videoCount}개 첨부`);
  if (voiceCount > 0) mediaParts.push(`음성 녹음 ${voiceCount}개 첨부`);
  const mediaContext = mediaParts.length > 0 ? `\n[${mediaParts.join(", ")}]` : "";

  return `${fieldConfig.system}
${historyContext}${personalContext}${interestContext}${careerContext}${specialtyContext}${mediaContext}

[사용자의 ${fieldLabel} 연습 노트]
${content}

위 내용을 분석하고 아래 형식으로 피드백해주세요 (600-900자):
📌 전체 인상 (1-2문장)
💪 강점 분석 (구체적 근거와 함께)
🎯 개선 포인트 (실천 가능한 제안)
🎭 기술 분석 (${fieldLabel} 분야 전문 용어로 구체적 기술 평가)
🎨 롤모델 연결 (관련 아티스트/작품 레퍼런스)
💡 영감 포인트 (다른 분야와의 연결점, 크로스오버 아이디어)
📈 성장 트래킹 (이전 대비 변화 관찰)
🔜 다음 스텝 (구체적 연습 과제 1개)`;
}

function heuristicFallback(field, content) {
  const fieldConfig = FIELD_AI_PROMPTS[field] || FIELD_AI_PROMPTS.acting;
  const fieldLabel = FIELD_LABELS[field] || "예술";
  const keywords = fieldConfig.keywords || [];
  const contentLen = (content || "").length;

  const found = keywords.filter((kw) => content.includes(kw));
  const strengthLine = found.length > 0
    ? `특히 ${found.slice(0, 2).join(", ")}에 대한 관찰이 구체적이에요.`
    : `${fieldLabel} 연습의 기본기를 다지고 있는 단계예요.`;

  return `📌 ${fieldLabel} 분야의 ${contentLen > 200 ? "상세한" : "간결한"} 연습 기록이에요. ${contentLen > 100 ? "기록의 양이 충분해서 분석할 포인트가 많아요." : "조금 더 자세히 기록하면 더 깊은 피드백이 가능해요."}

💪 ${strengthLine} 꾸준한 기록 습관 자체가 성장의 핵심이에요.

🎯 다음 연습에서는 ${keywords[0] || "핵심 키워드"}에 집중해보세요. 구체적인 목표를 정하고 기록하면 성장 곡선이 더 명확해질 거예요.

🎨 이 방향은 많은 ${fieldLabel} 아티스트들이 성장기에 겪는 과정이에요.

📈 기록을 계속 쌓아가면 AI가 더 정밀한 종적 분석을 제공할 수 있어요.

🔜 오늘 연습한 내용을 기반으로, 같은 주제를 다른 접근법으로 한 번 더 시도해보세요.`;
}

export async function analyzeNote(field, content, savedNotes = [], currentNote = null, userProfile = {}) {
  const prompt = buildAIPrompt(field, content, savedNotes, currentNote, userProfile);

  try {
    const response = await fetch(`${SERVER_URL}/api/ai-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        field,
        noteTitle: currentNote?.title || "",
      }),
    });

    if (!response.ok) throw new Error("Server error");
    const data = await response.json();
    return data.analysis || data.content || heuristicFallback(field, content);
  } catch (e) {
    console.log("AI server unavailable, using heuristic:", e.message);
    return heuristicFallback(field, content);
  }
}

function heuristicPortfolioSummary(portfolioItems, userProfile, artistProfile) {
  const photoCount = portfolioItems.filter((i) => i.type === "photo").length;
  const videoCount = portfolioItems.filter((i) => i.type === "video").length;
  const fieldCounts = {};
  portfolioItems.forEach((item) => { fieldCounts[item.field] = (fieldCounts[item.field] || 0) + 1; });
  const topField = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])[0];
  const fieldLabel = topField ? (FIELD_LABELS[topField[0]] || topField[0]) : "예술";
  const name = userProfile.name || "아티스트";
  const mediaParts = [];
  if (photoCount > 0) mediaParts.push(`사진 ${photoCount}장`);
  if (videoCount > 0) mediaParts.push(`영상 ${videoCount}개`);
  const mediaStr = mediaParts.join("과 ") || "작품";
  return `${name}님은 ${fieldLabel} 분야를 중심으로 활동하는 아티스트입니다. ${mediaStr}으로 구성된 포트폴리오를 보유하고 있으며, 종합 점수 ${artistProfile.overallScore || 0}점의 성장 기록을 쌓아가고 있습니다. 꾸준한 기록과 다양한 작품 활동을 통해 자신만의 예술 세계를 구축해가는 중입니다.`;
}

export async function generatePortfolioSummary(portfolioItems, userProfile, artistProfile) {
  const fieldCounts = {};
  portfolioItems.forEach((item) => { fieldCounts[item.field] = (fieldCounts[item.field] || 0) + 1; });
  const descriptions = portfolioItems
    .filter((i) => i.description)
    .slice(0, 5)
    .map((i) => i.description)
    .join("; ");

  const prompt = `당신은 ArtLink의 포트폴리오 코치입니다. 다음 아티스트의 포트폴리오를 기반으로 소개 문구를 작성해주세요 (200-300자).
이름: ${userProfile.name || "아티스트"}
분야: ${Object.entries(fieldCounts).map(([f, c]) => `${FIELD_LABELS[f] || f}(${c}건)`).join(", ")}
작품 설명: ${descriptions || "없음"}
종합 점수: ${artistProfile.overallScore || 0}점`;

  try {
    const response = await fetch(`${SERVER_URL}/api/ai-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, field: "general" }),
    });
    if (!response.ok) throw new Error("Server error");
    const data = await response.json();
    return data.analysis || data.content || heuristicPortfolioSummary(portfolioItems, userProfile, artistProfile);
  } catch (e) {
    return heuristicPortfolioSummary(portfolioItems, userProfile, artistProfile);
  }
}

function heuristicStructuredPortfolio(userProfile, portfolioItems, artistProfile) {
  const name = userProfile.name || "아티스트";
  const genderLabel = { male: "남성", female: "여성", other: "" }[userProfile.gender] || "";
  const age = userProfile.birthDate ? (() => {
    const b = new Date(userProfile.birthDate);
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a > 0 ? a : null;
  })() : null;
  const heightStr = userProfile.height ? `${userProfile.height}cm` : "";
  const fieldLabels = (userProfile.fields || []).map((f) => FIELD_LABELS[f] || f).join(", ") || "예술";
  const specStr = (userProfile.specialties || []).slice(0, 5).join(", ");
  const careerStr = (userProfile.career || []).slice(0, 3).map((c) => `${c.title}(${c.role})`).join(", ");
  const score = artistProfile.overallScore || 0;

  const lines = [`[ArtLink 프로필 카드]`, ``, `이름: ${name}`];
  if (genderLabel || age) lines.push(`${genderLabel}${age ? ` / ${age}세` : ""}${heightStr ? ` / ${heightStr}` : ""}`);
  lines.push(`분야: ${fieldLabels}`);
  if (specStr) lines.push(`특기: ${specStr}`);
  if (careerStr) lines.push(`주요 경력: ${careerStr}`);
  if (userProfile.school) lines.push(`학교: ${userProfile.school}`);
  if (userProfile.agency) lines.push(`소속: ${userProfile.agency}`);
  lines.push(`종합 점수: ${score}점`);
  lines.push(``);
  lines.push(`${name}님은 ${fieldLabels} 분야에서 활동하며, 포트폴리오 ${portfolioItems.length}건의 작품과 꾸준한 기록을 통해 자신만의 예술 세계를 만들어가고 있습니다.`);

  return lines.join("\n");
}

export async function generateStructuredPortfolio(userProfile, portfolioItems, artistProfile, savedNotes = []) {
  const name = userProfile.name || "아티스트";
  const fieldLabels = (userProfile.fields || []).map((f) => FIELD_LABELS[f] || f).join(", ");
  const specStr = (userProfile.specialties || []).join(", ");
  const careerStr = (userProfile.career || []).map((c) => `${c.title}(${c.role}, ${c.year})`).join("; ");

  const prompt = `당신은 ArtLink의 프로필 카드 작성 전문가입니다. 다음 아티스트의 구조화된 프로필 소개서를 300-500자로 작성해주세요.
이름: ${name}
성별: ${userProfile.gender || "미입력"}
나이: ${userProfile.birthDate || "미입력"}
키: ${userProfile.height || "미입력"}cm
분야: ${fieldLabels || "미입력"}
특기: ${specStr || "없음"}
경력: ${careerStr || "없음"}
학교: ${userProfile.school || "미입력"}
소속사: ${userProfile.agency || "없음"}
종합 점수: ${artistProfile.overallScore || 0}점
포트폴리오: ${portfolioItems.length}건
노트: ${savedNotes.length}개

전문적이면서도 개성있는 프로필 소개서를 작성해주세요.`;

  try {
    const response = await fetch(`${SERVER_URL}/api/ai-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, field: "general" }),
    });
    if (!response.ok) throw new Error("Server error");
    const data = await response.json();
    return data.analysis || data.content || heuristicStructuredPortfolio(userProfile, portfolioItems, artistProfile);
  } catch {
    return heuristicStructuredPortfolio(userProfile, portfolioItems, artistProfile);
  }
}

export { FIELD_AI_PROMPTS };
