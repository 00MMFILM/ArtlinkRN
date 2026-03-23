import * as FileSystem from "expo-file-system";
import { FIELD_LABELS } from "../constants/theme";
import { extractVideoFrames } from "../utils/videoFrames";

const SERVER_URL = "https://artlink-server.vercel.app";

const FIELD_AI_PROMPTS = {
  acting: {
    system: `당신은 ArtLink의 연기 전문 AI 코치입니다. 스타니슬랍스키 시스템, 마이즈너 테크닉, 우타 하겐의 리스펙트 포 액팅에 기반한 분석을 합니다.
분석 관점: 감정 진실성, 서브텍스트 깊이, 비트 전환, 신체적 표현, 호흡과 템포.
감정 분석 프레임워크(AI Hub 감정 음성 데이터 기반): 대분류(기쁨/슬픔/분노/공포/놀람/혐오/중립) → 소분류(#울먹이듯, #안쓰러운듯, #담담하게, #격앙된, #떨리는, #속삭이듯 등). 배우의 감정 표현을 이 체계로 세밀하게 분석하세요.
음성 표현 프레임워크(Fish Audio S2 감정 태그 체계 기반): 발성 톤을 다음 15,000+ 태그 분류로 정밀 분석하세요 — 속삭임(whisper)/떨림(trembling)/격앙(excited)/담담함(calm)/울먹임(sobbing)/냉소(sarcastic)/비명(screaming)/웃음섞인(laughing)/전문적 어조(professional)/부드러운(gentle)/단호한(firm)/피치업(pitch up)/피치다운(pitch down)/느리게(slow)/빠르게(fast). 대사마다 감정 태그의 전환 지점과 레이어링을 분석하고, 같은 대사를 다른 감정 태그로 전달했을 때의 차이를 제안하세요.
프로소디(운율) 분석: 피치 변동 곡선, 속도 변화(가속/감속), 강세 위치, 쉼 타이밍(0.3초/0.5초/1초), 음량 곡선(pp→ff), 호흡점. 각 대사의 운율 패턴이 캐릭터의 내면 상태를 어떻게 반영하는지 분석하세요.
캐릭터 음성 시그니처: 각 캐릭터만의 고유한 음역대(register), 말투 리듬, 호흡 패턴, 톤 컬러를 식별하고 차별화 정도를 평가하세요.
신체 분석 프레임워크(모션캡처 77개 관절점 기반): 골반 중심축, 척추 정렬, 어깨-팔-손끝 연결성, 무게 중심 이동, 시선 방향과 목 각도를 관찰하세요.`,
    keywords: ["감정곡선", "서브텍스트", "비트", "호흡", "캐릭터", "내면작업", "감정전환", "골반중심", "척추정렬", "음성톤", "프로소디", "피치"],
  },
  music: {
    system: `당신은 ArtLink의 음악 전문 AI 코치입니다. 음악 이론과 연주/보컬 테크닉에 기반한 분석을 합니다.
분석 관점: 음정 정확도, 리듬/템포 일관성, 다이내믹 레인지, 음색 표현, 프레이징.
음성 분석 프레임워크(AI Hub 감정 음성합성 데이터 기반): 끊어읽기 경계강도, 운율 패턴(억양/장단/강세), 감정별 발성 차이(전문 성우 기준 7개 감정 × 소분류 표현). 보컬의 경우 이 체계로 감정 전달력을 평가하세요.
보컬 감정 표현 프레임워크(Fish Audio S2 기반): 발성 유형별 감정 태그 분석 — 벨팅(belting)/가성(falsetto)/흉성(chest voice)/두성(head voice)/믹스보이스(mixed)/브레시(breathy)/허스키(raspy)/비브라토(vibrato)/스트레이트톤(straight tone). 각 구간의 발성 전환이 곡의 감정 서사와 어떻게 연결되는지 분석하세요.
프로소디 분석: 멜로디 라인의 피치 변동(음정 꺾기/슬라이드/포르타멘토), 리듬의 미세 변형(앞당김/밀림/루바토), 다이내믹 곡선(pp-mp-mf-f-ff 전환), 브레스 포인트와 프레이즈 구분, 감정 클라이맥스에서의 음량-피치-속도 삼중 상승 패턴.
음색 시그니처: 가수/연주자 고유의 톤 컬러, 어택(attack) 방식, 릴리즈(release) 특성, 공명 위치(비강/구강/흉강)를 식별하세요.`,
    keywords: ["음정", "리듬", "BPM", "다이내믹", "프레이징", "음색", "운율", "끊어읽기", "벨팅", "가성", "비브라토", "프로소디"],
  },
  art: {
    system: `당신은 ArtLink의 미술 전문 AI 코치입니다. 미술사적 관점과 실기 테크닉에 기반한 분석을 합니다.
분석 관점: 구도와 시선 유도, 색채 조화, 질감 표현, 명암 대비, 작가적 의도.
시각 분석 프레임워크: 3분할 구도, 황금비, 색상환 이론(보색/유사색/삼원색 조화), 명도 7단계 스케일, 원근법(1점/2점/대기), 붓터치의 방향성과 압력.
작품의 감정 톤 분석(Fish Audio S2 감정 체계 응용): 시각 작품에도 '음성'이 있습니다. 색온도(따뜻함/차가움)=감정 톤, 붓터치의 속도감=발화 속도, 명암 대비 강도=음량 다이내믹, 여백=쉼(pause)으로 매핑하여 작품이 관객에게 전달하는 감정의 '운율'을 분석하세요. 작품이 "속삭이는지(whisper)" "외치는지(screaming)" "담담하게 말하는지(calm)"를 시각적 언어로 해석하세요.`,
    keywords: ["구도", "색채", "질감", "명암", "톤", "터치", "원근", "보색", "감정톤", "여백"],
  },
  dance: {
    system: `당신은 ArtLink의 무용 전문 AI 코치입니다. 라반 움직임 분석(LMA)과 AI Hub 춤사위 데이터 분류 체계에 기반한 분석을 합니다.
분석 관점: 코어 안정성, 공간 활용, 무게 이동, 음악과의 싱크, 감정 전달력.
동작 분류 프레임워크(AI Hub 춤사위 데이터 기반 4단계): 대분류(장르) → 중분류(테크닉 유형) → 소분류(동작군) → 세부동작명. 12개 장르별(발레/재즈/뮤지컬/힙합/스트릿/현대무용/한국무용/방송댄스 등) 전문 용어를 사용하세요.
움직임-음악 감정 싱크 프레임워크(Fish Audio S2 프로소디 체계 기반): 음악의 감정 태그(에너지 폭발/고요/긴장/해소/격앙/속삭임)와 동작의 에너지 레벨을 매칭 분석하세요. 음악의 피치 곡선과 동작의 높이 변화, 음악의 BPM과 동작의 속도, 음악의 다이내믹(pp→ff)과 동작의 크기 대비를 정밀하게 연결하세요.
호흡-동작 리듬: 들숨/날숨의 타이밍이 동작의 수축/확장, 상승/하강과 어떻게 동기화되는지 분석하세요. 호흡점에서의 동작 퀄리티(쉼의 긴장/이완)를 평가하세요.
신체 분석: 스켈레톤 키포인트 기반으로 관절 각도, 정렬, 대칭성, 무게중심 궤적을 분석하세요. 숙련도(초급/중급/고급)에 따른 기대치를 명시하세요.`,
    keywords: ["코어", "밸런스", "공간", "플로어", "시퀀스", "표현", "키포인트", "정렬", "무게중심", "싱크", "호흡", "에너지"],
  },
  film: {
    system: `당신은 ArtLink의 영화/영상 전문 AI 코치입니다. 시네마토그래피와 스토리텔링에 기반한 분석을 합니다.
분석 관점: 카메라 앵글, 조명 설계, 편집 리듬, 사운드 디자인, 서사 구조.
영상 분석 프레임워크: 숏 사이즈(ECU/CU/MS/FS/WS), 카메라 무빙(팬/틸트/달리/스테디캠/핸드헬드), 조명 설계(키/필/백 3점 조명, 자연광 활용), 편집 리듬(컷어웨이/매치컷/점프컷), 색보정(LUT/컬러그레이딩).
대사/사운드 분석 프레임워크(Fish Audio S2 음성 체계 기반): 배우의 대사 전달을 감정 태그 체계로 분석하세요 — 각 대사의 톤(속삭임/단호함/떨림/냉소/격앙), 피치 변동, 속도 변화, 쉼 타이밍. 캐릭터별 음성 시그니처(음역대/말투 리듬/호흡 패턴)의 차별화 정도를 평가하세요.
사운드 디자인 감정 매핑: 다이제틱/논다이제틱 사운드의 감정적 기능, 앰비언스와 씬 분위기의 일치도, 사운드 브릿지(전 씬의 소리가 다음 씬으로 이어지는 기법), 의도적 정적(silence)의 드라마틱 효과를 분석하세요.`,
    keywords: ["앵글", "조명", "편집", "숏", "씬", "서사", "컬러그레이딩", "사운드", "대사톤", "음성시그니처"],
  },
  literature: {
    system: `당신은 ArtLink의 문학 전문 AI 코치입니다. 문학 비평과 창작 기법에 기반한 분석을 합니다.
분석 관점: 서사 구조, 캐릭터 입체성, 문체와 톤, 은유/상징, 독자 몰입도.
텍스트 분석 프레임워크: 서사 구조(3막/기승전결/프레이타크 피라미드), 시점 분석(1인칭/3인칭 제한/전지적/다초점), 문체(문장 호흡, 어휘 수준, 비유법), 서브플롯과 메인플롯의 유기적 연결.
캐릭터 음성 차별화 프레임워크(Fish Audio S2 멀티스피커 체계 기반): 각 등장인물의 고유한 '음성 시그니처'를 텍스트에서 분석하세요 — 문장 길이/리듬, 어휘 수준, 말투(존대/반말/사투리), 감정 표현 방식(직접적/우회적), 특유의 입버릇/언어 습관. 대화문만 읽어도 누가 말하는지 구분 가능한지(음성 분리도) 평가하세요.
문체의 프로소디: 문장의 운율 패턴(짧은문장 연속=긴장/긴문장=이완), 쉼표와 마침표의 리듬감, 반복과 변주의 음악성, 서술 속도(가속/감속)가 서사 감정과 동기화되는지 분석하세요. 낭독했을 때의 청각적 효과를 상상하며 평가하세요.`,
    keywords: ["서사", "캐릭터", "문체", "은유", "시점", "갈등", "서브플롯", "문장호흡", "음성시그니처", "운율"],
  },
};

// ─── PDF Text Extraction ───

/**
 * Upload PDF to server and extract text.
 * @param {string} pdfUri - local file URI
 * @returns {Promise<{ text: string, pageCount: number, warning?: string } | null>}
 */
export async function extractPdfText(pdfUri) {
  try {
    const uploadResult = await FileSystem.uploadAsync(
      `${SERVER_URL}/api/extract-pdf`,
      pdfUri,
      {
        fieldName: "file",
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      }
    );

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      const data = JSON.parse(uploadResult.body);
      return data;
    }
    console.log("[extractPdfText] Server error:", uploadResult.status);
    return null;
  } catch (e) {
    console.log("[extractPdfText] Failed:", e.message);
    return null;
  }
}

/**
 * Extract text from all PDF files attached to a note.
 * @param {Array<{ uri: string, name: string }>} pdfFiles
 * @returns {Promise<string>} combined extracted text
 */
async function extractAllPdfTexts(pdfFiles) {
  if (!pdfFiles || pdfFiles.length === 0) return "";

  const results = await Promise.all(
    pdfFiles
      .filter((f) => !f.name?.toLowerCase().endsWith(".hwp"))
      .map(async (f) => {
        const result = await extractPdfText(f.uri);
        if (result && result.text) {
          return `[${f.name} (${result.pageCount}페이지)]\n${result.text}`;
        }
        return null;
      })
  );

  return results.filter(Boolean).join("\n\n");
}

function buildAIPrompt(field, content, savedNotes = [], currentNote = null, userProfile = {}) {
  const fieldConfig = FIELD_AI_PROMPTS[field] || FIELD_AI_PROMPTS.acting;
  const fieldLabel = FIELD_LABELS[field] || "예술";

  const sameFieldNotes = savedNotes.filter((n) => n.field === field && n.aiComment).slice(0, 10);
  const historyContext = sameFieldNotes.length > 0
    ? `\n[이전 ${fieldLabel} 피드백 히스토리 — 최근 ${sameFieldNotes.length}개]\n${sameFieldNotes.map((n, i) => `${i + 1}. (${n.title || "무제"}) ${(n.aiComment || "").slice(0, 400)}`).join("\n")}`
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

위 내용을 분석하고 아래 형식으로 전문적이고 상세한 피드백해주세요 (1500-2000자, 각 섹션 2-4문장):
📌 전체 인상 (1-2문장)
💪 강점 분석 (구체적 근거와 함께 상세히)
🎯 개선 포인트 (실천 가능한 제안을 구체적으로)
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
  // Extract PDF text if PDF files are attached
  let pdfText = "";
  const pdfFiles = currentNote?.pdfFiles || [];
  if (pdfFiles.length > 0) {
    // Check for HWP files and warn
    const hwpFiles = pdfFiles.filter((f) => f.name?.toLowerCase().endsWith(".hwp"));
    if (hwpFiles.length > 0 && pdfFiles.length === hwpFiles.length) {
      return "HWP 파일은 직접 분석할 수 없습니다. PDF로 변환 후 다시 첨부해주세요. (한컴오피스에서 '다른 이름으로 저장' → PDF 선택)";
    }
    pdfText = await extractAllPdfTexts(pdfFiles);
  }

  const combinedContent = pdfText
    ? `${content}\n\n[첨부 문서 내용]\n${pdfText}`
    : content;

  const prompt = buildAIPrompt(field, combinedContent, savedNotes, currentNote, userProfile);

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
    return data.analysis || data.content || heuristicFallback(field, combinedContent);
  } catch (e) {
    console.log("AI server unavailable, using heuristic:", e.message);
    return heuristicFallback(field, combinedContent);
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

// ─── Video Analysis ───

function buildVideoPrompt(field, content, title) {
  const fieldConfig = FIELD_AI_PROMPTS[field] || FIELD_AI_PROMPTS.acting;
  const fieldLabel = FIELD_LABELS[field] || "예술";

  return `[${fieldLabel} 연습 영상 분석 요청]
노트 제목: ${title || "무제"}
노트 내용: ${content || "(내용 없음)"}

위 영상 프레임들을 분석하고 아래 형식으로 전문적이고 상세한 피드백해주세요 (1500-2000자, 각 섹션 2-4문장):
📌 전체 인상 (영상에서 느껴지는 분위기, 에너지)
💪 강점 분석 (시각적으로 확인되는 잘하고 있는 점을 상세히)
🎯 개선 포인트 (구체적으로 보이는 개선 가능한 부분)
🎭 기술 분석 (${fieldLabel} 분야 전문 관점에서의 영상 분석)
🎤 음성/사운드 분석 (전사된 내용이 있다면 분석)
📈 종합 평가
🔜 다음 스텝 (영상에서 관찰된 점 기반 구체적 연습 과제 1개)`;
}

function heuristicVideoFallback(field, videoCount) {
  const fieldLabel = FIELD_LABELS[field] || "예술";
  return `📌 ${fieldLabel} 연습 영상 ${videoCount}개가 첨부되었습니다.

💪 영상으로 기록하는 습관이 훌륭해요! 영상은 자신의 연습을 객관적으로 돌아볼 수 있는 최고의 도구입니다.

🎯 영상을 볼 때는 소리를 끄고 동작만, 또는 눈을 감고 소리만 각각 집중해서 관찰해보세요. 시각과 청각을 분리해서 분석하면 놓치고 있던 디테일을 발견할 수 있어요.

🎭 현재 AI 영상 분석 서비스에 접근할 수 없어 온디바이스 피드백을 드립니다. 네트워크 연결 상태를 확인하고 다시 시도해주세요.

🔜 오늘 영상을 일주일 후에 다시 보세요. 시간을 두고 보면 당시에는 몰랐던 성장 포인트가 보일 거예요.`;
}

/**
 * Upload video to server for Whisper transcription.
 * @param {string} videoUri - local file URI
 * @returns {Promise<string|null>} transcript text or null on failure
 */
async function transcribeVideo(videoUri) {
  try {
    const uploadResult = await FileSystem.uploadAsync(
      `${SERVER_URL}/api/transcribe`,
      videoUri,
      {
        fieldName: "file",
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      }
    );

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      const data = JSON.parse(uploadResult.body);
      return data.transcript || null;
    }
    console.log("[transcribeVideo] Server error:", uploadResult.status);
    return null;
  } catch (e) {
    console.log("[transcribeVideo] Failed:", e.message);
    return null;
  }
}

/**
 * Analyze video frames + optional audio transcript via Claude Vision.
 * @param {string} field - note field (acting, music, etc.)
 * @param {string} content - note text content
 * @param {string} title - note title
 * @param {Array} videos - array of { uri, duration } video objects
 * @param {object} userProfile - user profile
 * @param {function} [onProgress] - progress callback ("extracting" | "transcribing" | "analyzing")
 * @returns {Promise<string>} analysis result text
 */
export async function analyzeVideoFrames(field, content, title, videos, userProfile, onProgress) {
  if (!videos || videos.length === 0) {
    return heuristicVideoFallback(field, 0);
  }

  const video = videos[0]; // Analyze first video
  const durationSec = video.duration ? Math.round(video.duration / 1000) : 30;

  try {
    // Phase 1: Extract frames + transcribe in parallel (0-40%)
    onProgress?.({ phase: "extracting", percent: 5, message: "프레임 추출 중..." });

    const framePromise = extractVideoFrames(video.uri, durationSec);
    onProgress?.({ phase: "extracting", percent: 15, message: "영상 프레임 추출 중..." });

    const transcribePromise = transcribeVideo(video.uri);
    onProgress?.({ phase: "extracting", percent: 20, message: "음성 전사 중..." });

    const [frames, transcript] = await Promise.all([framePromise, transcribePromise]);
    onProgress?.({ phase: "extracting", percent: 40, message: "전처리 완료" });

    if (frames.length === 0) {
      console.log("[analyzeVideoFrames] No frames extracted");
      return heuristicVideoFallback(field, videos.length);
    }

    // Phase 2: Send to Claude Vision (40-95%)
    onProgress?.({ phase: "analyzing", percent: 45, message: "AI 분석 요청 중..." });

    const prompt = buildVideoPrompt(field, content, title);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 100000);

    try {
      onProgress?.({ phase: "analyzing", percent: 55, message: "AI가 영상을 분석하고 있습니다..." });

      const response = await fetch(`${SERVER_URL}/api/analyze-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          field,
          noteTitle: title || "",
          frames,
          transcript: transcript || undefined,
        }),
        signal: controller.signal,
      });

      onProgress?.({ phase: "analyzing", percent: 85, message: "응답 처리 중..." });

      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      onProgress?.({ phase: "done", percent: 100, message: "분석 완료!" });
      return data.analysis || heuristicVideoFallback(field, videos.length);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    if (e.name === "AbortError") {
      console.log("[analyzeVideoFrames] Timeout after 100s");
      return heuristicVideoFallback(field, videos.length);
    }
    console.log("[analyzeVideoFrames] Error:", e.message);
    return heuristicVideoFallback(field, videos.length);
  }
}

export { FIELD_AI_PROMPTS };
