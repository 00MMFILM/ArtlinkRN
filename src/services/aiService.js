import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { FIELD_LABELS } from "../constants/theme";
import { extractVideoFrames } from "../utils/videoFrames";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseClient";
import i18n from "i18next";

const SERVER_URL = "https://artlink-server.vercel.app";
const IMAGE_MAX_DIMENSION = 1024; // Resize images before AI analysis to save API cost

/**
 * Resize image to max dimension while maintaining aspect ratio.
 * Returns the URI of the resized image.
 */
async function resizeImageForAI(uri) {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: IMAGE_MAX_DIMENSION } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch (e) {
    console.log("[resizeImageForAI] Failed, using original:", e.message);
    return uri;
  }
}

// ─── Language Helper ───

/**
 * Returns the AI prompt language key based on the current i18n language.
 * - "ko" for Korean
 * - "ja" for Japanese
 * - "zh" for any Chinese variant (zh-CN, zh-TW, etc.)
 * - "en" for everything else
 */
function getAILanguage() {
  const lang = i18n.language || "en";
  if (lang === "ko") return "ko";
  if (lang === "ja") return "ja";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

/**
 * Returns a localized field label for AI prompts.
 * For Korean, uses FIELD_LABELS from theme.js (original behavior).
 * For other languages, uses i18n translations.
 */
function getFieldLabel(field) {
  const lang = getAILanguage();
  if (lang === "ko") return FIELD_LABELS[field] || "예술";
  return i18n.t(`fields.${field}`, { defaultValue: i18n.t("fields.general", { defaultValue: "Art" }) });
}

/**
 * Returns a localized gender label for AI prompts.
 */
function getGenderLabel(gender) {
  const lang = getAILanguage();
  if (lang === "ko") {
    return { male: "남성", female: "여성", other: "" }[gender] || "";
  }
  if (lang === "ja") {
    return { male: "男性", female: "女性", other: "" }[gender] || "";
  }
  if (lang === "zh") {
    return { male: "男性", female: "女性", other: "" }[gender] || "";
  }
  return { male: "Male", female: "Female", other: "" }[gender] || "";
}

// ─── Multilingual FIELD_AI_PROMPTS ───

const FIELD_AI_PROMPTS = {
  acting: {
    ko: {
      system: `당신은 ArtLink의 연기 전문 AI 코치입니다. 스타니슬랍스키 시스템, 마이즈너 테크닉, 우타 하겐의 리스펙트 포 액팅에 기반한 분석을 합니다.
분석 관점: 감정 진실성, 서브텍스트 깊이, 비트 전환, 신체적 표현, 호흡과 템포.
감정 분석 프레임워크(AI Hub 감정 음성 데이터 기반): 대분류(기쁨/슬픔/분노/공포/놀람/혐오/중립) → 소분류(#울먹이듯, #안쓰러운듯, #담담하게, #격앙된, #떨리는, #속삭이듯 등). 배우의 감정 표현을 이 체계로 세밀하게 분석하세요.
음성 표현 프레임워크(Fish Audio S2 감정 태그 체계 기반): 발성 톤을 다음 15,000+ 태그 분류로 정밀 분석하세요 — 속삭임(whisper)/떨림(trembling)/격앙(excited)/담담함(calm)/울먹임(sobbing)/냉소(sarcastic)/비명(screaming)/웃음섞인(laughing)/전문적 어조(professional)/부드러운(gentle)/단호한(firm)/피치업(pitch up)/피치다운(pitch down)/느리게(slow)/빠르게(fast). 대사마다 감정 태그의 전환 지점과 레이어링을 분석하고, 같은 대사를 다른 감정 태그로 전달했을 때의 차이를 제안하세요.
프로소디(운율) 분석: 피치 변동 곡선, 속도 변화(가속/감속), 강세 위치, 쉼 타이밍(0.3초/0.5초/1초), 음량 곡선(pp→ff), 호흡점. 각 대사의 운율 패턴이 캐릭터의 내면 상태를 어떻게 반영하는지 분석하세요.
캐릭터 음성 시그니처: 각 캐릭터만의 고유한 음역대(register), 말투 리듬, 호흡 패턴, 톤 컬러를 식별하고 차별화 정도를 평가하세요.
신체 분석 프레임워크(모션캡처 77개 관절점 기반): 골반 중심축, 척추 정렬, 어깨-팔-손끝 연결성, 무게 중심 이동, 시선 방향과 목 각도를 관찰하세요.`,
      keywords: ["감정곡선", "서브텍스트", "비트", "호흡", "캐릭터", "내면작업", "감정전환", "골반중심", "척추정렬", "음성톤", "프로소디", "피치"],
    },
    en: {
      system: `You are ArtLink's acting AI coach. You analyze based on the Stanislavski System, Meisner Technique, and Uta Hagen's Respect for Acting.
Analysis perspectives: emotional truth, subtext depth, beat transitions, physicality, breath and tempo.
Emotion analysis framework (based on AI Hub emotion speech data): Major categories (joy/sadness/anger/fear/surprise/disgust/neutral) → subcategories (#sobbing, #sympathetic, #calm, #agitated, #trembling, #whispering, etc.). Analyze the actor's emotional expression in fine detail using this system.
Vocal expression framework (based on Fish Audio S2 emotion tag system): Precisely analyze vocal tone using 15,000+ tag classifications — whisper/trembling/excited/calm/sobbing/sarcastic/screaming/laughing/professional/gentle/firm/pitch up/pitch down/slow/fast. Analyze transition points and layering of emotion tags for each line, and suggest differences when the same line is delivered with different emotion tags.
Prosody analysis: pitch variation curves, speed changes (acceleration/deceleration), stress positions, pause timing (0.3s/0.5s/1s), volume curves (pp→ff), breath points. Analyze how each line's prosodic pattern reflects the character's inner state.
Character vocal signature: Identify each character's unique register, speech rhythm, breathing pattern, and tone color, and evaluate the degree of differentiation.
Physical analysis framework (based on 77-joint motion capture): Observe pelvic center axis, spinal alignment, shoulder-arm-fingertip connectivity, center of gravity shifts, gaze direction and neck angle.`,
      keywords: ["emotion arc", "subtext", "beat", "breath", "character", "inner work", "emotional transition", "pelvic center", "spinal alignment", "vocal tone", "prosody", "pitch"],
    },
    ja: {
      system: `あなたはArtLinkの演技専門AIコーチです。スタニスラフスキー・システム、マイズナー・テクニック、ウタ・ハーゲンの「リスペクト・フォー・アクティング」に基づいた分析を行います。
分析の視点：感情の真実性、サブテキストの深さ、ビート転換、身体的表現、呼吸とテンポ。
感情分析フレームワーク（AI Hub感情音声データ基盤）：大分類（喜び/悲しみ/怒り/恐怖/驚き/嫌悪/中立）→小分類（#嗚咽するように、#切なそうに、#淡々と、#激昂した、#震える、#囁くように等）。俳優の感情表現をこの体系で細かく分析してください。
音声表現フレームワーク（Fish Audio S2感情タグ体系基盤）：発声トーンを15,000以上のタグ分類で精密に分析してください — 囁き(whisper)/震え(trembling)/激昂(excited)/淡々(calm)/嗚咽(sobbing)/冷笑(sarcastic)/叫び(screaming)/笑い交じり(laughing)/プロフェッショナル(professional)/柔らかい(gentle)/断固とした(firm)/ピッチアップ(pitch up)/ピッチダウン(pitch down)/ゆっくり(slow)/速く(fast)。各台詞の感情タグの転換点とレイヤリングを分析し、同じ台詞を異なる感情タグで伝えた場合の違いを提案してください。
プロソディ（韻律）分析：ピッチ変動曲線、速度変化（加速/減速）、強勢位置、ポーズのタイミング（0.3秒/0.5秒/1秒）、音量曲線（pp→ff）、ブレスポイント。各台詞の韻律パターンがキャラクターの内面状態をどのように反映しているか分析してください。
キャラクター音声シグネチャー：各キャラクター固有の音域（レジスター）、話し方のリズム、呼吸パターン、トーンカラーを識別し、差別化の程度を評価してください。
身体分析フレームワーク（モーションキャプチャー77関節点基盤）：骨盤中心軸、脊椎アライメント、肩-腕-指先の連結性、重心移動、視線方向と首の角度を観察してください。`,
      keywords: ["感情曲線", "サブテキスト", "ビート", "呼吸", "キャラクター", "内面作業", "感情転換", "骨盤中心", "脊椎アライメント", "音声トーン", "プロソディ", "ピッチ"],
    },
    zh: {
      system: `你是ArtLink的表演专业AI教练。基于斯坦尼斯拉夫斯基体系、迈斯纳技巧和乌塔·哈根的《尊重表演》进行分析。
分析视角：情感真实性、潜台词深度、节拍转换、肢体表达、呼吸与节奏。
情感分析框架（基于AI Hub情感语音数据）：大分类（喜悦/悲伤/愤怒/恐惧/惊讶/厌恶/中性）→ 小分类（#啜泣般、#怜惜般、#平淡地、#激昂地、#颤抖地、#低语般等）。用此体系细致分析演员的情感表达。
语音表达框架（基于Fish Audio S2情感标签体系）：用15,000+标签分类精确分析发声音调 — 低语(whisper)/颤抖(trembling)/激昂(excited)/平静(calm)/啜泣(sobbing)/讽刺(sarcastic)/尖叫(screaming)/带笑(laughing)/专业(professional)/温柔(gentle)/坚定(firm)/升调(pitch up)/降调(pitch down)/慢速(slow)/快速(fast)。分析每句台词情感标签的转换点和叠加，建议用不同情感标签传达同一台词时的差异。
韵律分析：音高变化曲线、速度变化（加速/减速）、重音位置、停顿时机（0.3秒/0.5秒/1秒）、音量曲线（pp→ff）、呼吸点。分析每句台词的韵律模式如何反映角色的内心状态。
角色语音签名：识别每个角色独特的音域（声区）、说话节奏、呼吸模式、音色，评估差异化程度。
肢体分析框架（基于动作捕捉77个关节点）：观察骨盆中心轴、脊柱排列、肩-臂-指尖连贯性、重心移动、视线方向和颈部角度。`,
      keywords: ["情感曲线", "潜台词", "节拍", "呼吸", "角色", "内心作业", "情感转换", "骨盆中心", "脊柱排列", "语音音调", "韵律", "音高"],
    },
  },
  music: {
    ko: {
      system: `당신은 ArtLink의 음악 전문 AI 코치입니다. 음악 이론과 연주/보컬 테크닉에 기반한 분석을 합니다.
분석 관점: 음정 정확도, 리듬/템포 일관성, 다이내믹 레인지, 음색 표현, 프레이징.
음성 분석 프레임워크(AI Hub 감정 음성합성 데이터 기반): 끊어읽기 경계강도, 운율 패턴(억양/장단/강세), 감정별 발성 차이(전문 성우 기준 7개 감정 × 소분류 표현). 보컬의 경우 이 체계로 감정 전달력을 평가하세요.
보컬 감정 표현 프레임워크(Fish Audio S2 기반): 발성 유형별 감정 태그 분석 — 벨팅(belting)/가성(falsetto)/흉성(chest voice)/두성(head voice)/믹스보이스(mixed)/브레시(breathy)/허스키(raspy)/비브라토(vibrato)/스트레이트톤(straight tone). 각 구간의 발성 전환이 곡의 감정 서사와 어떻게 연결되는지 분석하세요.
프로소디 분석: 멜로디 라인의 피치 변동(음정 꺾기/슬라이드/포르타멘토), 리듬의 미세 변형(앞당김/밀림/루바토), 다이내믹 곡선(pp-mp-mf-f-ff 전환), 브레스 포인트와 프레이즈 구분, 감정 클라이맥스에서의 음량-피치-속도 삼중 상승 패턴.
음색 시그니처: 가수/연주자 고유의 톤 컬러, 어택(attack) 방식, 릴리즈(release) 특성, 공명 위치(비강/구강/흉강)를 식별하세요.`,
      keywords: ["음정", "리듬", "BPM", "다이내믹", "프레이징", "음색", "운율", "끊어읽기", "벨팅", "가성", "비브라토", "프로소디"],
    },
    en: {
      system: `You are ArtLink's music AI coach. You analyze based on music theory and performance/vocal technique.
Analysis perspectives: pitch accuracy, rhythm/tempo consistency, dynamic range, timbre expression, phrasing.
Vocal analysis framework (based on AI Hub emotion speech synthesis data): phrasing boundary strength, prosodic patterns (intonation/duration/stress), emotion-specific vocal differences (7 emotions × subcategory expressions based on professional voice actors). For vocals, evaluate emotional delivery using this system.
Vocal emotion expression framework (based on Fish Audio S2): Analyze emotion tags by vocal type — belting/falsetto/chest voice/head voice/mixed/breathy/raspy/vibrato/straight tone. Analyze how vocal transitions in each section connect to the song's emotional narrative.
Prosody analysis: pitch variations in melody lines (pitch bending/slides/portamento), micro-rhythmic variations (anticipation/delay/rubato), dynamic curves (pp-mp-mf-f-ff transitions), breath points and phrase boundaries, triple escalation pattern of volume-pitch-speed at emotional climaxes.
Timbral signature: Identify the singer/performer's unique tone color, attack style, release characteristics, and resonance placement (nasal/oral/chest cavity).`,
      keywords: ["pitch", "rhythm", "BPM", "dynamics", "phrasing", "timbre", "prosody", "phrasing boundary", "belting", "falsetto", "vibrato", "prosody"],
    },
    ja: {
      system: `あなたはArtLinkの音楽専門AIコーチです。音楽理論と演奏/ボーカルテクニックに基づいた分析を行います。
分析の視点：音程の正確さ、リズム/テンポの一貫性、ダイナミックレンジ、音色表現、フレージング。
音声分析フレームワーク（AI Hub感情音声合成データ基盤）：フレーズ境界強度、韻律パターン（イントネーション/長短/アクセント）、感情別発声の違い（プロ声優基準7感情×小分類表現）。ボーカルの場合、この体系で感情伝達力を評価してください。
ボーカル感情表現フレームワーク（Fish Audio S2基盤）：発声タイプ別感情タグ分析 — ベルティング(belting)/ファルセット(falsetto)/チェストボイス(chest voice)/ヘッドボイス(head voice)/ミックスボイス(mixed)/ブレシー(breathy)/ハスキー(raspy)/ビブラート(vibrato)/ストレートトーン(straight tone)。各セクションの発声転換が曲の感情ナラティブとどのように繋がるか分析してください。
プロソディ分析：メロディラインのピッチ変動（ピッチベンド/スライド/ポルタメント）、リズムの微細変形（前倒し/遅延/ルバート）、ダイナミクス曲線（pp-mp-mf-f-ff転換）、ブレスポイントとフレーズ区分、感情クライマックスでの音量-ピッチ-速度の三重上昇パターン。
音色シグネチャー：歌手/演奏者固有のトーンカラー、アタック方式、リリース特性、共鳴位置（鼻腔/口腔/胸腔）を識別してください。`,
      keywords: ["音程", "リズム", "BPM", "ダイナミクス", "フレージング", "音色", "韻律", "フレーズ境界", "ベルティング", "ファルセット", "ビブラート", "プロソディ"],
    },
    zh: {
      system: `你是ArtLink的音乐专业AI教练。基于音乐理论和演奏/声乐技巧进行分析。
分析视角：音准、节奏/速度一致性、动态范围、音色表现、乐句处理。
语音分析框架（基于AI Hub情感语音合成数据）：断句边界强度、韵律模式（语调/长短/重音）、不同情感的发声差异（基于专业配音演员的7种情感×子分类表达）。对于声乐，使用此体系评估情感传达力。
声乐情感表达框架（基于Fish Audio S2）：按发声类型分析情感标签 — 强声(belting)/假声(falsetto)/胸声(chest voice)/头声(head voice)/混合声(mixed)/气声(breathy)/沙哑(raspy)/颤音(vibrato)/直音(straight tone)。分析每个段落的发声转换如何与歌曲的情感叙事相连。
韵律分析：旋律线的音高变化（弯音/滑音/滑奏）、节奏的微变（提前/延后/自由速度）、动态曲线（pp-mp-mf-f-ff转换）、呼吸点和乐句划分、情感高潮处音量-音高-速度的三重上升模式。
音色签名：识别歌手/演奏者独特的音色、起音方式、释音特征和共鸣位置（鼻腔/口腔/胸腔）。`,
      keywords: ["音准", "节奏", "BPM", "力度", "乐句", "音色", "韵律", "断句", "强声", "假声", "颤音", "韵律分析"],
    },
  },
  art: {
    ko: {
      system: `당신은 ArtLink의 미술 전문 AI 코치입니다. 미술사적 관점과 실기 테크닉에 기반한 분석을 합니다.
분석 관점: 구도와 시선 유도, 색채 조화, 질감 표현, 명암 대비, 작가적 의도.
시각 분석 프레임워크: 3분할 구도, 황금비, 색상환 이론(보색/유사색/삼원색 조화), 명도 7단계 스케일, 원근법(1점/2점/대기), 붓터치의 방향성과 압력.
작품의 감정 톤 분석(Fish Audio S2 감정 체계 응용): 시각 작품에도 '음성'이 있습니다. 색온도(따뜻함/차가움)=감정 톤, 붓터치의 속도감=발화 속도, 명암 대비 강도=음량 다이내믹, 여백=쉼(pause)으로 매핑하여 작품이 관객에게 전달하는 감정의 '운율'을 분석하세요. 작품이 "속삭이는지(whisper)" "외치는지(screaming)" "담담하게 말하는지(calm)"를 시각적 언어로 해석하세요.`,
      keywords: ["구도", "색채", "질감", "명암", "톤", "터치", "원근", "보색", "감정톤", "여백"],
    },
    en: {
      system: `You are ArtLink's visual art AI coach. You analyze based on art historical perspectives and practical techniques.
Analysis perspectives: composition and gaze direction, color harmony, texture expression, value contrast, artistic intent.
Visual analysis framework: rule of thirds, golden ratio, color wheel theory (complementary/analogous/triadic harmony), 7-level value scale, perspective (1-point/2-point/atmospheric), brushstroke direction and pressure.
Emotional tone analysis of works (applying Fish Audio S2 emotion system): Visual works also have a 'voice'. Map color temperature (warm/cool)=emotional tone, brushstroke speed=speech rate, value contrast intensity=volume dynamics, negative space=pause, and analyze the emotional 'prosody' the work conveys to the viewer. Interpret whether the work is "whispering," "screaming," or "speaking calmly" in visual language.`,
      keywords: ["composition", "color", "texture", "value", "tone", "brushwork", "perspective", "complementary", "emotional tone", "negative space"],
    },
    ja: {
      system: `あなたはArtLinkの美術専門AIコーチです。美術史的視点と実技テクニックに基づいた分析を行います。
分析の視点：構図と視線誘導、色彩の調和、質感表現、明暗のコントラスト、作家の意図。
視覚分析フレームワーク：三分割法、黄金比、色相環理論（補色/類似色/三原色調和）、明度7段階スケール、遠近法（1点/2点/空気遠近法）、筆致の方向性と圧力。
作品の感情トーン分析（Fish Audio S2感情体系応用）：視覚作品にも「声」があります。色温度（暖かさ/冷たさ）=感情トーン、筆致の速度感=発話速度、明暗コントラスト強度=音量ダイナミクス、余白=ポーズ（休止）としてマッピングし、作品が観客に伝える感情の「韻律」を分析してください。作品が「囁いているのか(whisper)」「叫んでいるのか(screaming)」「淡々と語っているのか(calm)」を視覚的言語で解釈してください。`,
      keywords: ["構図", "色彩", "質感", "明暗", "トーン", "筆致", "遠近法", "補色", "感情トーン", "余白"],
    },
    zh: {
      system: `你是ArtLink的美术专业AI教练。基于美术史视角和实践技法进行分析。
分析视角：构图与视线引导、色彩和谐、质感表现、明暗对比、艺术意图。
视觉分析框架：三分法构图、黄金比例、色轮理论（互补色/类似色/三原色调和）、明度7级阶梯、透视法（一点/两点/空气透视）、笔触方向性和压力。
作品情感色调分析（应用Fish Audio S2情感体系）：视觉作品也有"声音"。将色温（暖/冷）=情感色调、笔触速度感=说话速度、明暗对比强度=音量动态、留白=停顿进行映射，分析作品向观众传达的情感"韵律"。用视觉语言解读作品是在"低语(whisper)"、"呐喊(screaming)"还是"平静叙述(calm)"。`,
      keywords: ["构图", "色彩", "质感", "明暗", "色调", "笔触", "透视", "互补色", "情感色调", "留白"],
    },
  },
  dance: {
    ko: {
      system: `당신은 ArtLink의 무용 전문 AI 코치입니다. 라반 움직임 분석(LMA)과 AI Hub 춤사위 데이터 분류 체계에 기반한 분석을 합니다.
분석 관점: 코어 안정성, 공간 활용, 무게 이동, 음악과의 싱크, 감정 전달력.
동작 분류 프레임워크(AI Hub 춤사위 데이터 기반 4단계): 대분류(장르) → 중분류(테크닉 유형) → 소분류(동작군) → 세부동작명. 12개 장르별(발레/재즈/뮤지컬/힙합/스트릿/현대무용/한국무용/방송댄스 등) 전문 용어를 사용하세요.
움직임-음악 감정 싱크 프레임워크(Fish Audio S2 프로소디 체계 기반): 음악의 감정 태그(에너지 폭발/고요/긴장/해소/격앙/속삭임)와 동작의 에너지 레벨을 매칭 분석하세요. 음악의 피치 곡선과 동작의 높이 변화, 음악의 BPM과 동작의 속도, 음악의 다이내믹(pp→ff)과 동작의 크기 대비를 정밀하게 연결하세요.
호흡-동작 리듬: 들숨/날숨의 타이밍이 동작의 수축/확장, 상승/하강과 어떻게 동기화되는지 분석하세요. 호흡점에서의 동작 퀄리티(쉼의 긴장/이완)를 평가하세요.
신체 분석: 스켈레톤 키포인트 기반으로 관절 각도, 정렬, 대칭성, 무게중심 궤적을 분석하세요. 숙련도(초급/중급/고급)에 따른 기대치를 명시하세요.`,
      keywords: ["코어", "밸런스", "공간", "플로어", "시퀀스", "표현", "키포인트", "정렬", "무게중심", "싱크", "호흡", "에너지"],
    },
    en: {
      system: `You are ArtLink's dance AI coach. You analyze based on Laban Movement Analysis (LMA) and AI Hub dance movement classification systems.
Analysis perspectives: core stability, spatial awareness, weight transfer, musicality sync, emotional expression.
Movement classification framework (4-tier AI Hub dance data): Major category (genre) → mid category (technique type) → subcategory (movement group) → specific movement name. Use specialized terminology for 12 genres (ballet/jazz/musical theater/hip-hop/street/contemporary/traditional Korean/K-pop choreography, etc.).
Movement-music emotion sync framework (based on Fish Audio S2 prosody system): Match-analyze the music's emotion tags (energy burst/stillness/tension/release/agitation/whisper) with movement energy levels. Precisely connect the music's pitch curve with movement height changes, the music's BPM with movement speed, and the music's dynamics (pp→ff) with movement scale contrast.
Breath-movement rhythm: Analyze how inhalation/exhalation timing synchronizes with contraction/expansion, rise/fall of movements. Evaluate movement quality at breath points (pause tension/release).
Physical analysis: Analyze joint angles, alignment, symmetry, and center of gravity trajectory based on skeleton keypoints. Specify expectations according to skill level (beginner/intermediate/advanced).`,
      keywords: ["core", "balance", "space", "floor", "sequence", "expression", "keypoint", "alignment", "center of gravity", "sync", "breath", "energy"],
    },
    ja: {
      system: `あなたはArtLinkのダンス専門AIコーチです。ラバン動作分析（LMA）とAI Hub舞踊データ分類体系に基づいた分析を行います。
分析の視点：コアの安定性、空間活用、重心移動、音楽とのシンク、感情伝達力。
動作分類フレームワーク（AI Hub舞踊データ基盤4段階）：大分類（ジャンル）→中分類（テクニックタイプ）→小分類（動作群）→詳細動作名。12ジャンル別（バレエ/ジャズ/ミュージカル/ヒップホップ/ストリート/コンテンポラリー/韓国舞踊/K-POPダンスなど）の専門用語を使用してください。
動き-音楽感情シンクフレームワーク（Fish Audio S2プロソディ体系基盤）：音楽の感情タグ（エネルギー爆発/静寂/緊張/解放/激昂/囁き）と動作のエネルギーレベルをマッチング分析してください。音楽のピッチ曲線と動きの高さ変化、音楽のBPMと動きの速度、音楽のダイナミクス（pp→ff）と動きの大小のコントラストを精密に連結してください。
呼吸-動作リズム：吸気/呼気のタイミングが動作の収縮/拡張、上昇/下降とどのように同期するか分析してください。ブレスポイントでの動作クオリティ（ポーズの緊張/弛緩）を評価してください。
身体分析：スケルトンキーポイント基盤で関節角度、アライメント、対称性、重心軌跡を分析してください。習熟度（初級/中級/上級）に応じた期待値を明示してください。`,
      keywords: ["コア", "バランス", "空間", "フロア", "シーケンス", "表現", "キーポイント", "アライメント", "重心", "シンク", "呼吸", "エネルギー"],
    },
    zh: {
      system: `你是ArtLink的舞蹈专业AI教练。基于拉班动作分析（LMA）和AI Hub舞蹈数据分类体系进行分析。
分析视角：核心稳定性、空间运用、重心转移、与音乐的同步、情感传达力。
动作分类框架（基于AI Hub舞蹈数据4级）：大分类（流派）→ 中分类（技术类型）→ 小分类（动作组）→ 具体动作名。使用12种流派（芭蕾/爵士/音乐剧/嘻哈/街舞/现代舞/韩国传统舞/K-POP编舞等）的专业术语。
动作-音乐情感同步框架（基于Fish Audio S2韵律体系）：将音乐的情感标签（能量爆发/宁静/紧张/释放/激昂/低语）与动作的能量水平进行匹配分析。精确连接音乐的音高曲线与动作高度变化、音乐的BPM与动作速度、音乐的力度（pp→ff）与动作幅度对比。
呼吸-动作节奏：分析吸气/呼气的时机如何与动作的收缩/扩展、上升/下降同步。评估呼吸点处的动作质量（停顿的紧张/放松）。
身体分析：基于骨骼关键点分析关节角度、对齐、对称性和重心轨迹。根据熟练程度（初级/中级/高级）明确期望标准。`,
      keywords: ["核心", "平衡", "空间", "地面", "序列", "表现", "关键点", "对齐", "重心", "同步", "呼吸", "能量"],
    },
  },
  film: {
    ko: {
      system: `당신은 ArtLink의 영화/영상 전문 AI 코치입니다. 시네마토그래피와 스토리텔링에 기반한 분석을 합니다.
분석 관점: 카메라 앵글, 조명 설계, 편집 리듬, 사운드 디자인, 서사 구조.
영상 분석 프레임워크: 숏 사이즈(ECU/CU/MS/FS/WS), 카메라 무빙(팬/틸트/달리/스테디캠/핸드헬드), 조명 설계(키/필/백 3점 조명, 자연광 활용), 편집 리듬(컷어웨이/매치컷/점프컷), 색보정(LUT/컬러그레이딩).
대사/사운드 분석 프레임워크(Fish Audio S2 음성 체계 기반): 배우의 대사 전달을 감정 태그 체계로 분석하세요 — 각 대사의 톤(속삭임/단호함/떨림/냉소/격앙), 피치 변동, 속도 변화, 쉼 타이밍. 캐릭터별 음성 시그니처(음역대/말투 리듬/호흡 패턴)의 차별화 정도를 평가하세요.
사운드 디자인 감정 매핑: 다이제틱/논다이제틱 사운드의 감정적 기능, 앰비언스와 씬 분위기의 일치도, 사운드 브릿지(전 씬의 소리가 다음 씬으로 이어지는 기법), 의도적 정적(silence)의 드라마틱 효과를 분석하세요.`,
      keywords: ["앵글", "조명", "편집", "숏", "씬", "서사", "컬러그레이딩", "사운드", "대사톤", "음성시그니처"],
    },
    en: {
      system: `You are ArtLink's film/video AI coach. You analyze based on cinematography and storytelling.
Analysis perspectives: camera angles, lighting design, editing rhythm, sound design, narrative structure.
Visual analysis framework: shot sizes (ECU/CU/MS/FS/WS), camera movements (pan/tilt/dolly/steadicam/handheld), lighting design (key/fill/back 3-point lighting, natural light usage), editing rhythm (cutaway/match cut/jump cut), color correction (LUT/color grading).
Dialogue/sound analysis framework (based on Fish Audio S2 voice system): Analyze actor dialogue delivery using emotion tag systems — tone of each line (whisper/firm/trembling/sarcastic/agitated), pitch variation, speed changes, pause timing. Evaluate the degree of vocal signature differentiation per character (register/speech rhythm/breathing pattern).
Sound design emotion mapping: Analyze emotional function of diegetic/non-diegetic sound, scene ambience-mood alignment, sound bridges (audio from previous scene carrying into next), and dramatic effect of intentional silence.`,
      keywords: ["angle", "lighting", "editing", "shot", "scene", "narrative", "color grading", "sound", "dialogue tone", "vocal signature"],
    },
    ja: {
      system: `あなたはArtLinkの映画/映像専門AIコーチです。シネマトグラフィーとストーリーテリングに基づいた分析を行います。
分析の視点：カメラアングル、照明設計、編集リズム、サウンドデザイン、物語構造。
映像分析フレームワーク：ショットサイズ（ECU/CU/MS/FS/WS）、カメラワーク（パン/ティルト/ドリー/ステディカム/ハンドヘルド）、照明設計（キー/フィル/バックの3点照明、自然光活用）、編集リズム（カットアウェイ/マッチカット/ジャンプカット）、カラーコレクション（LUT/カラーグレーディング）。
台詞/サウンド分析フレームワーク（Fish Audio S2音声体系基盤）：俳優の台詞デリバリーを感情タグ体系で分析してください — 各台詞のトーン（囁き/断固/震え/冷笑/激昂）、ピッチ変動、速度変化、ポーズのタイミング。キャラクター別の音声シグネチャー（音域/話し方のリズム/呼吸パターン）の差別化度を評価してください。
サウンドデザイン感情マッピング：ダイジェティック/ノンダイジェティックサウンドの感情的機能、アンビエンスとシーンの雰囲気の一致度、サウンドブリッジ（前シーンの音が次シーンへ繋がる技法）、意図的な静寂(silence)のドラマチック効果を分析してください。`,
      keywords: ["アングル", "照明", "編集", "ショット", "シーン", "物語", "カラーグレーディング", "サウンド", "台詞トーン", "音声シグネチャー"],
    },
    zh: {
      system: `你是ArtLink的电影/影像专业AI教练。基于电影摄影学和叙事手法进行分析。
分析视角：摄影角度、灯光设计、剪辑节奏、声音设计、叙事结构。
影像分析框架：镜头尺寸（ECU/CU/MS/FS/WS）、摄影机运动（摇/俯仰/推轨/稳定器/手持）、灯光设计（主光/辅光/背光三点布光、自然光运用）、剪辑节奏（切出/匹配剪辑/跳切）、调色（LUT/调色分级）。
台词/声音分析框架（基于Fish Audio S2语音体系）：用情感标签体系分析演员的台词传达 — 每句台词的语调（低语/坚定/颤抖/讽刺/激昂）、音高变化、速度变化、停顿时机。评估每个角色语音签名（音域/说话节奏/呼吸模式）的差异化程度。
声音设计情感映射：分析画内/画外声音的情感功能、环境音与场景氛围的匹配度、声音桥接（前一场景的声音延续到下一场景的技法）、刻意静默(silence)的戏剧效果。`,
      keywords: ["角度", "灯光", "剪辑", "镜头", "场景", "叙事", "调色", "声音", "台词语调", "语音签名"],
    },
  },
  literature: {
    ko: {
      system: `당신은 ArtLink의 문학 전문 AI 코치입니다. 문학 비평과 창작 기법에 기반한 분석을 합니다.
분석 관점: 서사 구조, 캐릭터 입체성, 문체와 톤, 은유/상징, 독자 몰입도.
텍스트 분석 프레임워크: 서사 구조(3막/기승전결/프레이타크 피라미드), 시점 분석(1인칭/3인칭 제한/전지적/다초점), 문체(문장 호흡, 어휘 수준, 비유법), 서브플롯과 메인플롯의 유기적 연결.
캐릭터 음성 차별화 프레임워크(Fish Audio S2 멀티스피커 체계 기반): 각 등장인물의 고유한 '음성 시그니처'를 텍스트에서 분석하세요 — 문장 길이/리듬, 어휘 수준, 말투(존대/반말/사투리), 감정 표현 방식(직접적/우회적), 특유의 입버릇/언어 습관. 대화문만 읽어도 누가 말하는지 구분 가능한지(음성 분리도) 평가하세요.
문체의 프로소디: 문장의 운율 패턴(짧은문장 연속=긴장/긴문장=이완), 쉼표와 마침표의 리듬감, 반복과 변주의 음악성, 서술 속도(가속/감속)가 서사 감정과 동기화되는지 분석하세요. 낭독했을 때의 청각적 효과를 상상하며 평가하세요.`,
      keywords: ["서사", "캐릭터", "문체", "은유", "시점", "갈등", "서브플롯", "문장호흡", "음성시그니처", "운율"],
    },
    en: {
      system: `You are ArtLink's literature AI coach. You analyze based on literary criticism and creative writing techniques.
Analysis perspectives: narrative structure, character depth, style and tone, metaphor/symbolism, reader immersion.
Text analysis framework: narrative structure (3-act/introduction-development-turn-conclusion/Freytag's pyramid), point of view analysis (first person/limited third/omniscient/multi-focal), style (sentence rhythm, vocabulary level, figurative language), organic connection between subplots and main plot.
Character voice differentiation framework (based on Fish Audio S2 multi-speaker system): Analyze each character's unique 'voice signature' in the text — sentence length/rhythm, vocabulary level, speech register (formal/informal/dialect), emotional expression method (direct/indirect), distinctive verbal habits/speech patterns. Evaluate whether characters are distinguishable by dialogue alone (voice separation).
Stylistic prosody: Analyze sentence rhythmic patterns (short sentence sequences=tension/long sentences=release), the rhythm of commas and periods, musicality of repetition and variation, and whether narrative speed (acceleration/deceleration) synchronizes with narrative emotion. Evaluate imagining the auditory effect when read aloud.`,
      keywords: ["narrative", "character", "style", "metaphor", "POV", "conflict", "subplot", "sentence rhythm", "voice signature", "prosody"],
    },
    ja: {
      system: `あなたはArtLinkの文学専門AIコーチです。文学批評と創作技法に基づいた分析を行います。
分析の視点：物語構造、キャラクターの立体性、文体とトーン、比喩/象徴、読者の没入度。
テキスト分析フレームワーク：物語構造（3幕/起承転結/フライタークのピラミッド）、視点分析（一人称/三人称限定/全知/多焦点）、文体（文章の呼吸、語彙レベル、比喩法）、サブプロットとメインプロットの有機的接続。
キャラクター音声差別化フレームワーク（Fish Audio S2マルチスピーカー体系基盤）：各登場人物固有の「音声シグネチャー」をテキストから分析してください — 文の長さ/リズム、語彙レベル、話し方（敬語/タメ口/方言）、感情表現方式（直接的/間接的）、特有の口癖/言語習慣。台詞だけ読んでも誰が話しているか区別できるか（音声分離度）を評価してください。
文体のプロソディ：文の韻律パターン（短文連続=緊張/長文=弛緩）、句読点のリズム感、反復と変奏の音楽性、叙述速度（加速/減速）が物語の感情と同期しているか分析してください。朗読した際の聴覚的効果を想像しながら評価してください。`,
      keywords: ["物語", "キャラクター", "文体", "比喩", "視点", "葛藤", "サブプロット", "文章呼吸", "音声シグネチャー", "韻律"],
    },
    zh: {
      system: `你是ArtLink的文学专业AI教练。基于文学批评和创作技法进行分析。
分析视角：叙事结构、角色立体感、文风与基调、隐喻/象征、读者沉浸度。
文本分析框架：叙事结构（三幕式/起承转合/弗雷塔格金字塔）、视角分析（第一人称/有限第三人称/全知/多焦点）、文风（句式节奏、词汇水平、修辞手法）、副线与主线的有机联系。
角色声音差异化框架（基于Fish Audio S2多说话人体系）：分析文本中每个角色独特的"声音签名" — 句子长度/节奏、词汇水平、说话方式（敬语/随意/方言）、情感表达方式（直接/间接）、独特的口头禅/语言习惯。评估仅通过对话是否能区分说话者（声音分离度）。
文风韵律：分析句子的韵律模式（短句连续=紧张/长句=舒缓）、逗号和句号的节奏感、重复与变奏的音乐性、叙述速度（加速/减速）是否与叙事情感同步。以想象朗读时的听觉效果来评估。`,
      keywords: ["叙事", "角色", "文风", "隐喻", "视角", "冲突", "副线", "句式节奏", "声音签名", "韵律"],
    },
  },
};

// ─── Multilingual Response Format Templates ───

const RESPONSE_FORMAT = {
  ko: {
    feedbackHeader: (fieldLabel) => `위 내용을 분석하고 아래 형식으로 전문적이고 상세한 피드백해주세요 (1500-2000자, 각 섹션 2-4문장):
📌 전체 인상 (1-2문장)
💪 강점 분석 (구체적 근거와 함께 상세히)
🎯 개선 포인트 (실천 가능한 제안을 구체적으로)
🎭 기술 분석 (${fieldLabel} 분야 전문 용어로 구체적 기술 평가)
🎨 롤모델 연결 (관련 아티스트/작품 레퍼런스)
💡 영감 포인트 (다른 분야와의 연결점, 크로스오버 아이디어)
📈 성장 트래킹 (이전 대비 변화 관찰)
🔜 다음 스텝 (구체적 연습 과제 1개)`,
    userNoteLabel: (fieldLabel) => `[사용자의 ${fieldLabel} 연습 노트]`,
    historyLabel: (fieldLabel, count) => `\n[이전 ${fieldLabel} 피드백 히스토리 — 최근 ${count}개]`,
    untitled: "무제",
    roleModelLabel: (models) => `\n[사용자 롤모델: ${models}]`,
    interestLabel: (interests) => `\n[관심 분야: ${interests}]`,
    careerLabel: (careers) => `\n[경력: ${careers}]`,
    specialtyLabel: (specs) => `\n[특기: ${specs}]`,
    mediaPhoto: (n) => `사진 ${n}장 첨부`,
    mediaVideo: (n) => `영상 ${n}개 첨부`,
    mediaVoice: (n) => `음성 녹음 ${n}개 첨부`,
    videoFeedbackHeader: (fieldLabel) => `위 영상 프레임들을 분석하고 아래 형식으로 전문적이고 상세한 피드백해주세요 (1500-2000자, 각 섹션 2-4문장):
📌 전체 인상 (영상에서 느껴지는 분위기, 에너지)
💪 강점 분석 (시각적으로 확인되는 잘하고 있는 점을 상세히)
🎯 개선 포인트 (구체적으로 보이는 개선 가능한 부분)
🎭 기술 분석 (${fieldLabel} 분야 전문 관점에서의 영상 분석)
🎤 음성/사운드 분석 (전사된 내용이 있다면 분석)
📈 종합 평가
🔜 다음 스텝 (영상에서 관찰된 점 기반 구체적 연습 과제 1개)`,
    videoRequestLabel: (fieldLabel) => `[${fieldLabel} 연습 영상 분석 요청]`,
    noteTitle: (title) => `노트 제목: ${title || "무제"}`,
    noteContent: (content) => `노트 내용: ${content || "(내용 없음)"}`,
    pdfPageSuffix: "페이지",
    attachedDocLabel: "첨부 문서 내용",
    attachedAudioLabel: "첨부 오디오 전사 내용",
    hwpError: "HWP 파일은 직접 분석할 수 없습니다. PDF로 변환 후 다시 첨부해주세요. (한컴오피스에서 '다른 이름으로 저장' → PDF 선택)",
    growthMinError: "최소 2개 이상의 AI 분석 기록이 필요합니다",
    growthFail: "성장 분석 실패",
    matchFail: "매칭 실패",
    voiceLabel: (i) => `녹음 ${i}`,
    audioFileLabel: (i) => `오디오 ${i}`,
    voiceTranscriptLabel: (i) => `음성 녹음 ${i}`,
    audioTranscriptLabel: (name) => name,
    progressExtract: "프레임 추출 중...",
    progressFrameExtract: "영상 프레임 추출 중...",
    progressAudioExtract: "음성 추출 및 전사 중...",
    progressPreDone: "전처리 완료",
    progressFrameDone: "프레임 추출 완료 (음성 없음)",
    progressAIRequest: "AI 분석 요청 중...",
    progressAIAnalyzing: "AI가 영상을 분석하고 있습니다...",
    progressResponse: "응답 처리 중...",
    progressDone: "분석 완료!",
  },
  en: {
    feedbackHeader: (fieldLabel) => `Analyze the above content and provide professional, detailed feedback in the format below (1500-2000 characters, 2-4 sentences per section):
📌 Overall Impression (1-2 sentences)
💪 Strengths Analysis (with specific evidence in detail)
🎯 Areas for Improvement (concrete, actionable suggestions)
🎭 Technical Analysis (specific technical evaluation using ${fieldLabel} terminology)
🎨 Role Model Connection (related artist/work references)
💡 Inspiration Points (cross-domain connections, crossover ideas)
📈 Growth Tracking (observed changes compared to previous work)
🔜 Next Step (1 specific practice assignment)`,
    userNoteLabel: (fieldLabel) => `[User's ${fieldLabel} practice note]`,
    historyLabel: (fieldLabel, count) => `\n[Previous ${fieldLabel} feedback history — last ${count}]`,
    untitled: "Untitled",
    roleModelLabel: (models) => `\n[User's role models: ${models}]`,
    interestLabel: (interests) => `\n[Interests: ${interests}]`,
    careerLabel: (careers) => `\n[Career: ${careers}]`,
    specialtyLabel: (specs) => `\n[Specialties: ${specs}]`,
    mediaPhoto: (n) => `${n} photo(s) attached`,
    mediaVideo: (n) => `${n} video(s) attached`,
    mediaVoice: (n) => `${n} voice recording(s) attached`,
    videoFeedbackHeader: (fieldLabel) => `Analyze the above video frames and provide professional, detailed feedback in the format below (1500-2000 characters, 2-4 sentences per section):
📌 Overall Impression (mood and energy from the video)
💪 Strengths Analysis (visually confirmed strong points in detail)
🎯 Areas for Improvement (specific visible areas for improvement)
🎭 Technical Analysis (video analysis from ${fieldLabel} expert perspective)
🎤 Voice/Sound Analysis (analyze transcribed content if available)
📈 Overall Evaluation
🔜 Next Step (1 specific practice assignment based on observations)`,
    videoRequestLabel: (fieldLabel) => `[${fieldLabel} practice video analysis request]`,
    noteTitle: (title) => `Note title: ${title || "Untitled"}`,
    noteContent: (content) => `Note content: ${content || "(No content)"}`,
    pdfPageSuffix: "pages",
    attachedDocLabel: "Attached document content",
    attachedAudioLabel: "Attached audio transcription",
    hwpError: "HWP files cannot be analyzed directly. Please convert to PDF and re-attach. (In Hancom Office: 'Save As' → select PDF)",
    growthMinError: "At least 2 AI analysis records are required",
    growthFail: "Growth analysis failed",
    matchFail: "Matching failed",
    voiceLabel: (i) => `Recording ${i}`,
    audioFileLabel: (i) => `Audio ${i}`,
    voiceTranscriptLabel: (i) => `Voice recording ${i}`,
    audioTranscriptLabel: (name) => name,
    progressExtract: "Extracting frames...",
    progressFrameExtract: "Extracting video frames...",
    progressAudioExtract: "Extracting and transcribing audio...",
    progressPreDone: "Preprocessing complete",
    progressFrameDone: "Frame extraction complete (no audio)",
    progressAIRequest: "Requesting AI analysis...",
    progressAIAnalyzing: "AI is analyzing the video...",
    progressResponse: "Processing response...",
    progressDone: "Analysis complete!",
  },
  ja: {
    feedbackHeader: (fieldLabel) => `上記の内容を分析し、以下の形式で専門的かつ詳細なフィードバックをお願いします（1500-2000文字、各セクション2-4文）：
📌 全体の印象 (1-2文)
💪 強み分析 (具体的な根拠とともに詳しく)
🎯 改善ポイント (実践可能な提案を具体的に)
🎭 技術分析 (${fieldLabel}分野の専門用語で具体的な技術評価)
🎨 ロールモデルとの接続 (関連アーティスト/作品のリファレンス)
💡 インスピレーションポイント (他分野との接点、クロスオーバーのアイデア)
📈 成長トラッキング (以前と比較した変化の観察)
🔜 次のステップ (具体的な練習課題1つ)`,
    userNoteLabel: (fieldLabel) => `[ユーザーの${fieldLabel}練習ノート]`,
    historyLabel: (fieldLabel, count) => `\n[以前の${fieldLabel}フィードバック履歴 — 最近${count}件]`,
    untitled: "タイトルなし",
    roleModelLabel: (models) => `\n[ユーザーのロールモデル: ${models}]`,
    interestLabel: (interests) => `\n[関心分野: ${interests}]`,
    careerLabel: (careers) => `\n[経歴: ${careers}]`,
    specialtyLabel: (specs) => `\n[特技: ${specs}]`,
    mediaPhoto: (n) => `写真${n}枚添付`,
    mediaVideo: (n) => `映像${n}件添付`,
    mediaVoice: (n) => `音声録音${n}件添付`,
    videoFeedbackHeader: (fieldLabel) => `上記の映像フレームを分析し、以下の形式で専門的かつ詳細なフィードバックをお願いします（1500-2000文字、各セクション2-4文）：
📌 全体の印象 (映像から感じられる雰囲気、エネルギー)
💪 強み分析 (視覚的に確認できる良い点を詳しく)
🎯 改善ポイント (具体的に見える改善可能な部分)
🎭 技術分析 (${fieldLabel}分野の専門的な視点での映像分析)
🎤 音声/サウンド分析 (文字起こし内容があれば分析)
📈 総合評価
🔜 次のステップ (映像で観察された点に基づく具体的な練習課題1つ)`,
    videoRequestLabel: (fieldLabel) => `[${fieldLabel}練習映像分析リクエスト]`,
    noteTitle: (title) => `ノートタイトル: ${title || "タイトルなし"}`,
    noteContent: (content) => `ノート内容: ${content || "(内容なし)"}`,
    pdfPageSuffix: "ページ",
    attachedDocLabel: "添付文書の内容",
    attachedAudioLabel: "添付オーディオの文字起こし内容",
    hwpError: "HWPファイルは直接分析できません。PDFに変換してから再添付してください。（ハングルオフィスで「名前を付けて保存」→ PDF選択）",
    growthMinError: "AI分析記録が最低2件必要です",
    growthFail: "成長分析に失敗しました",
    matchFail: "マッチングに失敗しました",
    voiceLabel: (i) => `録音 ${i}`,
    audioFileLabel: (i) => `オーディオ ${i}`,
    voiceTranscriptLabel: (i) => `音声録音 ${i}`,
    audioTranscriptLabel: (name) => name,
    progressExtract: "フレーム抽出中...",
    progressFrameExtract: "映像フレーム抽出中...",
    progressAudioExtract: "音声抽出・文字起こし中...",
    progressPreDone: "前処理完了",
    progressFrameDone: "フレーム抽出完了（音声なし）",
    progressAIRequest: "AI分析リクエスト中...",
    progressAIAnalyzing: "AIが映像を分析しています...",
    progressResponse: "レスポンス処理中...",
    progressDone: "分析完了！",
  },
  zh: {
    feedbackHeader: (fieldLabel) => `分析以上内容，并按以下格式提供专业详细的反馈（1500-2000字，每部分2-4句）：
📌 整体印象 (1-2句)
💪 优势分析 (附具体依据详细说明)
🎯 改进要点 (具体可行的建议)
🎭 技术分析 (用${fieldLabel}领域专业术语进行具体技术评估)
🎨 榜样关联 (相关艺术家/作品参考)
💡 灵感要点 (与其他领域的关联、跨界创意)
📈 成长追踪 (与之前相比的变化观察)
🔜 下一步 (1个具体练习任务)`,
    userNoteLabel: (fieldLabel) => `[用户的${fieldLabel}练习笔记]`,
    historyLabel: (fieldLabel, count) => `\n[之前的${fieldLabel}反馈记录 — 最近${count}条]`,
    untitled: "无标题",
    roleModelLabel: (models) => `\n[用户榜样: ${models}]`,
    interestLabel: (interests) => `\n[兴趣领域: ${interests}]`,
    careerLabel: (careers) => `\n[经历: ${careers}]`,
    specialtyLabel: (specs) => `\n[特长: ${specs}]`,
    mediaPhoto: (n) => `附${n}张照片`,
    mediaVideo: (n) => `附${n}个视频`,
    mediaVoice: (n) => `附${n}段录音`,
    videoFeedbackHeader: (fieldLabel) => `分析以上视频帧，并按以下格式提供专业详细的反馈（1500-2000字，每部分2-4句）：
📌 整体印象 (视频中感受到的氛围和能量)
💪 优势分析 (视觉上确认的优点详细说明)
🎯 改进要点 (具体可见的改进空间)
🎭 技术分析 (从${fieldLabel}领域专业角度的视频分析)
🎤 语音/声音分析 (如有转录内容则进行分析)
📈 综合评价
🔜 下一步 (基于视频观察的1个具体练习任务)`,
    videoRequestLabel: (fieldLabel) => `[${fieldLabel}练习视频分析请求]`,
    noteTitle: (title) => `笔记标题: ${title || "无标题"}`,
    noteContent: (content) => `笔记内容: ${content || "(无内容)"}`,
    pdfPageSuffix: "页",
    attachedDocLabel: "附件文档内容",
    attachedAudioLabel: "附件音频转录内容",
    hwpError: "无法直接分析HWP文件。请转换为PDF后重新附加。（在韩文办公室中选择「另存为」→ PDF）",
    growthMinError: "至少需要2条AI分析记录",
    growthFail: "成长分析失败",
    matchFail: "匹配失败",
    voiceLabel: (i) => `录音 ${i}`,
    audioFileLabel: (i) => `音频 ${i}`,
    voiceTranscriptLabel: (i) => `语音录音 ${i}`,
    audioTranscriptLabel: (name) => name,
    progressExtract: "提取帧中...",
    progressFrameExtract: "提取视频帧中...",
    progressAudioExtract: "提取并转录音频中...",
    progressPreDone: "预处理完成",
    progressFrameDone: "帧提取完成（无音频）",
    progressAIRequest: "请求AI分析中...",
    progressAIAnalyzing: "AI正在分析视频...",
    progressResponse: "处理响应中...",
    progressDone: "分析完成！",
  },
};

/**
 * Get the current language's response format helpers.
 */
function getResponseFormat() {
  return RESPONSE_FORMAT[getAILanguage()] || RESPONSE_FORMAT.en;
}

/**
 * Get the field-specific AI prompt config for the current language.
 */
function getFieldConfig(field) {
  const fieldPrompts = FIELD_AI_PROMPTS[field] || FIELD_AI_PROMPTS.acting;
  const lang = getAILanguage();
  return fieldPrompts[lang] || fieldPrompts.en;
}

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
  const fmt = getResponseFormat();

  const results = await Promise.all(
    pdfFiles
      .filter((f) => !f.name?.toLowerCase().endsWith(".hwp"))
      .map(async (f) => {
        const result = await extractPdfText(f.uri);
        if (result && result.text) {
          return `[${f.name} (${result.pageCount}${fmt.pdfPageSuffix})]\n${result.text}`;
        }
        return null;
      })
  );

  return results.filter(Boolean).join("\n\n");
}

function buildAIPrompt(field, content, savedNotes = [], currentNote = null, userProfile = {}) {
  const fieldConfig = getFieldConfig(field);
  const fieldLabel = getFieldLabel(field);
  const fmt = getResponseFormat();

  const sameFieldNotes = savedNotes.filter((n) => n.field === field && n.aiComment).slice(0, 10);
  const historyContext = sameFieldNotes.length > 0
    ? `${fmt.historyLabel(fieldLabel, sameFieldNotes.length)}\n${sameFieldNotes.map((n, i) => `${i + 1}. (${n.title || fmt.untitled}) ${(n.aiComment || "").slice(0, 400)}`).join("\n")}`
    : "";

  const personalContext = userProfile.roleModels?.length
    ? fmt.roleModelLabel(userProfile.roleModels.join(", "))
    : "";

  const interestContext = userProfile.interests?.length
    ? fmt.interestLabel(userProfile.interests.join(", "))
    : "";

  const careerContext = userProfile.career?.length
    ? fmt.careerLabel(userProfile.career.slice(0, 5).map((c) => `${c.title}(${c.role})`).join(", "))
    : "";

  const specialtyContext = userProfile.specialties?.length
    ? fmt.specialtyLabel(userProfile.specialties.join(", "))
    : "";

  // Media metadata context
  const images = currentNote?.images || [];
  const voices = currentNote?.voiceRecordings || [];
  const photoCount = images.filter((i) => i.type !== "video").length;
  const videoCount = images.filter((i) => i.type === "video").length;
  const voiceCount = voices.length;
  const mediaParts = [];
  if (photoCount > 0) mediaParts.push(fmt.mediaPhoto(photoCount));
  if (videoCount > 0) mediaParts.push(fmt.mediaVideo(videoCount));
  if (voiceCount > 0) mediaParts.push(fmt.mediaVoice(voiceCount));
  const mediaContext = mediaParts.length > 0 ? `\n[${mediaParts.join(", ")}]` : "";

  return `${fieldConfig.system}
${historyContext}${personalContext}${interestContext}${careerContext}${specialtyContext}${mediaContext}

${fmt.userNoteLabel(fieldLabel)}
${content}

${fmt.feedbackHeader(fieldLabel)}`;
}

function heuristicFallback(field, content) {
  const fieldConfig = getFieldConfig(field);
  const fieldLabel = getFieldLabel(field);
  const lang = getAILanguage();
  const keywords = fieldConfig.keywords || [];
  const contentLen = (content || "").length;

  const found = keywords.filter((kw) => content.includes(kw));

  if (lang === "ko") {
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

  if (lang === "ja") {
    const strengthLine = found.length > 0
      ? `特に${found.slice(0, 2).join("、")}に関する観察が具体的です。`
      : `${fieldLabel}の練習の基礎を固めている段階です。`;

    return `📌 ${fieldLabel}分野の${contentLen > 200 ? "詳細な" : "簡潔な"}練習記録です。${contentLen > 100 ? "記録量が十分で、分析ポイントが多いです。" : "もう少し詳しく記録すると、より深いフィードバックが可能です。"}

💪 ${strengthLine} 継続的な記録習慣こそが成長の鍵です。

🎯 次の練習では${keywords[0] || "キーワード"}に集中してみてください。具体的な目標を設定して記録すると、成長曲線がより明確になります。

🎨 この方向性は、多くの${fieldLabel}アーティストが成長期に経験するプロセスです。

📈 記録を積み重ねていけば、AIがより精密な縦断分析を提供できます。

🔜 今日練習した内容をもとに、同じテーマを別のアプローチでもう一度試してみてください。`;
  }

  if (lang === "zh") {
    const strengthLine = found.length > 0
      ? `特别是对${found.slice(0, 2).join("、")}的观察很具体。`
      : `正处于夯实${fieldLabel}练习基础的阶段。`;

    return `📌 这是${fieldLabel}领域的${contentLen > 200 ? "详细" : "简洁"}练习记录。${contentLen > 100 ? "记录量充足，有很多可分析的要点。" : "如果能更详细地记录，可以获得更深入的反馈。"}

💪 ${strengthLine} 坚持记录的习惯本身就是成长的关键。

🎯 下次练习时请集中关注${keywords[0] || "关键词"}。设定具体目标并记录，成长曲线会更加清晰。

🎨 这个方向是很多${fieldLabel}艺术家在成长期都会经历的过程。

📈 持续积累记录，AI就能提供更精准的纵向分析。

🔜 基于今天的练习内容，用不同的方法再尝试同一主题。`;
  }

  // English (default)
  const strengthLine = found.length > 0
    ? `Your observations on ${found.slice(0, 2).join(", ")} are notably specific.`
    : `You're building a solid foundation in ${fieldLabel} practice.`;

  return `📌 This is a ${contentLen > 200 ? "detailed" : "concise"} practice record in ${fieldLabel}. ${contentLen > 100 ? "The amount of detail gives plenty of points to analyze." : "Recording in more detail will enable deeper feedback."}

💪 ${strengthLine} The habit of consistent recording is itself the key to growth.

🎯 In your next practice, focus on ${keywords[0] || "core keywords"}. Setting specific goals and documenting them will make your growth trajectory clearer.

🎨 This direction is a common growth phase that many ${fieldLabel} artists experience.

📈 As you build up more records, AI can provide more precise longitudinal analysis.

🔜 Based on today's practice, try approaching the same topic with a different method.`;
}

/**
 * Transcribe an audio file (voice recording or attached audio) via server.
 * Uploads to Supabase Storage, calls /api/transcribe, cleans up.
 * @param {string} audioUri - local file URI
 * @param {string} [label] - display label for logging
 * @returns {Promise<string|null>} transcript text or null
 */
async function transcribeAudioFile(audioUri, label = "audio") {
  try {
    let localUri = audioUri;
    if (!localUri.startsWith("file://")) {
      localUri = "file://" + localUri;
    }

    // Determine content type from URI
    const ext = (localUri.split(".").pop() || "").toLowerCase();
    const contentTypeMap = {
      wav: "audio/wav",
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      aac: "audio/aac",
      ogg: "audio/ogg",
      mp4: "video/mp4",
    };
    const contentType = contentTypeMap[ext] || "audio/mpeg";

    // Upload to Supabase Storage
    const fileName = `transcribe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext || "m4a"}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/temp-media/${fileName}`;

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      console.log(`[transcribeAudio] Upload failed (${label}):`, uploadResult.status);
      return null;
    }

    // Call transcribe API
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/temp-media/${fileName}`;
    const res = await fetch(`${SERVER_URL}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: publicUrl }),
    });

    // Clean up
    fetch(`${SUPABASE_URL}/storage/v1/object/temp-media/${fileName}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    }).catch(() => {});

    if (res.ok) {
      const data = await res.json();
      return data.transcript || null;
    }
    console.log(`[transcribeAudio] Transcribe failed (${label}):`, res.status);
    return null;
  } catch (e) {
    console.log(`[transcribeAudio] Error (${label}):`, e.message);
    return null;
  }
}

/**
 * Transcribe all audio attachments (voice recordings + audio files).
 * @returns {Promise<string>} combined transcript text
 */
async function transcribeAllAudio(voiceRecordings = [], audioFiles = []) {
  const tasks = [];
  const fmt = getResponseFormat();

  voiceRecordings.forEach((rec, i) => {
    tasks.push(
      Promise.race([
        transcribeAudioFile(rec.uri, fmt.voiceLabel(i + 1)),
        new Promise((resolve) => setTimeout(() => resolve(null), 120000)),
      ]).then((t) => (t ? `[${fmt.voiceTranscriptLabel(i + 1)}]\n${t}` : null))
    );
  });

  audioFiles.forEach((file, i) => {
    tasks.push(
      Promise.race([
        transcribeAudioFile(file.uri, file.name || fmt.audioFileLabel(i + 1)),
        new Promise((resolve) => setTimeout(() => resolve(null), 120000)),
      ]).then((t) => (t ? `[${fmt.audioTranscriptLabel(file.name || fmt.audioFileLabel(i + 1))}]\n${t}` : null))
    );
  });

  if (tasks.length === 0) return "";

  const results = await Promise.all(tasks);
  return results.filter(Boolean).join("\n\n");
}

export async function analyzeNote(field, content, savedNotes = [], currentNote = null, userProfile = {}) {
  const fmt = getResponseFormat();

  // Extract PDF text if PDF files are attached
  let pdfText = "";
  const pdfFiles = currentNote?.pdfFiles || [];
  if (pdfFiles.length > 0) {
    // Check for HWP files and warn
    const hwpFiles = pdfFiles.filter((f) => f.name?.toLowerCase().endsWith(".hwp"));
    if (hwpFiles.length > 0 && pdfFiles.length === hwpFiles.length) {
      return fmt.hwpError;
    }
    pdfText = await extractAllPdfTexts(pdfFiles);
  }

  // Transcribe audio attachments (voice recordings + audio files)
  let audioTranscript = "";
  const voiceRecordings = currentNote?.voiceRecordings || [];
  const audioFilesList = currentNote?.audioFiles || [];
  if (voiceRecordings.length > 0 || audioFilesList.length > 0) {
    audioTranscript = await transcribeAllAudio(voiceRecordings, audioFilesList);
  }

  let combinedContent = content;
  if (pdfText) {
    combinedContent += `\n\n[${fmt.attachedDocLabel}]\n${pdfText}`;
  }
  if (audioTranscript) {
    // Filter out garbage Whisper output (too short, repeated text, or irrelevant)
    const trimmed = audioTranscript.replace(/\[.*?\]\n?/g, "").trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words);
    const isGarbage = trimmed.length < 10 || (words.length > 3 && uniqueWords.size <= 2);
    if (!isGarbage) {
      combinedContent += `\n\n[${fmt.attachedAudioLabel}]\n${audioTranscript}`;
    }
  }

  // Convert attached images (non-video) to base64 for Vision analysis
  // Images are resized to max 1024px to reduce API cost (~50% savings)
  let imageFrames = [];
  const noteImages = (currentNote?.images || []).filter((i) => i.type !== "video");
  if (noteImages.length > 0) {
    const frameResults = await Promise.all(
      noteImages.slice(0, 5).map(async (img) => {
        try {
          const resizedUri = await resizeImageForAI(img.uri);
          const base64 = await FileSystem.readAsStringAsync(resizedUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return base64;
        } catch (e) {
          console.log("[analyzeNote] Image read failed:", e.message);
          return null;
        }
      })
    );
    imageFrames = frameResults.filter(Boolean);
  }

  const prompt = buildAIPrompt(field, combinedContent, savedNotes, currentNote, userProfile);

  try {
    const requestBody = {
      prompt,
      field,
      noteTitle: currentNote?.title || "",
    };
    if (imageFrames.length > 0) {
      requestBody.frames = imageFrames;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s client timeout

    const response = await fetch(`${SERVER_URL}/api/ai-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log("[analyzeNote] Server error:", response.status);
      throw new Error("AI_SERVER_ERROR");
    }
    const data = await response.json();
    if (!data.analysis && !data.content) {
      throw new Error("AI_EMPTY_RESPONSE");
    }
    return { analysis: data.analysis || data.content, scores: data.scores || null };
  } catch (e) {
    console.log("[analyzeNote] AI failed:", e.message);
    // Throw so caller can show error instead of silent heuristic
    throw e;
  }
}

function heuristicPortfolioSummary(portfolioItems, userProfile, artistProfile) {
  const lang = getAILanguage();
  const photoCount = portfolioItems.filter((i) => i.type === "photo").length;
  const videoCount = portfolioItems.filter((i) => i.type === "video").length;
  const fieldCounts = {};
  portfolioItems.forEach((item) => { fieldCounts[item.field] = (fieldCounts[item.field] || 0) + 1; });
  const topField = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])[0];
  const fieldLabel = topField ? getFieldLabel(topField[0]) : getFieldLabel("general");
  const name = userProfile.name || (lang === "ko" ? "아티스트" : lang === "ja" ? "アーティスト" : lang === "zh" ? "艺术家" : "Artist");
  const score = artistProfile.overallScore || 0;

  if (lang === "ko") {
    const mediaParts = [];
    if (photoCount > 0) mediaParts.push(`사진 ${photoCount}장`);
    if (videoCount > 0) mediaParts.push(`영상 ${videoCount}개`);
    const mediaStr = mediaParts.join("과 ") || "작품";
    return `${name}님은 ${fieldLabel} 분야를 중심으로 활동하는 아티스트입니다. ${mediaStr}으로 구성된 포트폴리오를 보유하고 있으며, 종합 점수 ${score}점의 성장 기록을 쌓아가고 있습니다. 꾸준한 기록과 다양한 작품 활동을 통해 자신만의 예술 세계를 구축해가는 중입니다.`;
  }

  if (lang === "ja") {
    const mediaParts = [];
    if (photoCount > 0) mediaParts.push(`写真${photoCount}枚`);
    if (videoCount > 0) mediaParts.push(`映像${videoCount}件`);
    const mediaStr = mediaParts.join("と") || "作品";
    return `${name}さんは${fieldLabel}分野を中心に活動するアーティストです。${mediaStr}で構成されたポートフォリオを持ち、総合スコア${score}点の成長記録を積み重ねています。継続的な記録と多様な作品活動を通じて、独自の芸術世界を構築しています。`;
  }

  if (lang === "zh") {
    const mediaParts = [];
    if (photoCount > 0) mediaParts.push(`${photoCount}张照片`);
    if (videoCount > 0) mediaParts.push(`${videoCount}个视频`);
    const mediaStr = mediaParts.join("和") || "作品";
    return `${name}是以${fieldLabel}领域为中心活动的艺术家。拥有由${mediaStr}组成的作品集，正在积累综合评分${score}分的成长记录。通过持续的记录和多样的创作活动，正在构建属于自己的艺术世界。`;
  }

  // English
  const mediaParts = [];
  if (photoCount > 0) mediaParts.push(`${photoCount} photo(s)`);
  if (videoCount > 0) mediaParts.push(`${videoCount} video(s)`);
  const mediaStr = mediaParts.join(" and ") || "works";
  return `${name} is an artist primarily active in ${fieldLabel}. With a portfolio of ${mediaStr} and an overall score of ${score}, they are steadily building their growth record. Through consistent documentation and diverse creative activities, they are crafting their own artistic identity.`;
}

export async function generatePortfolioSummary(portfolioItems, userProfile, artistProfile) {
  const lang = getAILanguage();
  const fieldCounts = {};
  portfolioItems.forEach((item) => { fieldCounts[item.field] = (fieldCounts[item.field] || 0) + 1; });
  const descriptions = portfolioItems
    .filter((i) => i.description)
    .slice(0, 5)
    .map((i) => i.description)
    .join("; ");

  const fieldStr = Object.entries(fieldCounts).map(([f, c]) => `${getFieldLabel(f)}(${c})`).join(", ");
  const artistName = userProfile.name || (lang === "ko" ? "아티스트" : lang === "ja" ? "アーティスト" : lang === "zh" ? "艺术家" : "Artist");
  const score = artistProfile.overallScore || 0;

  let prompt;
  if (lang === "ko") {
    prompt = `당신은 ArtLink의 포트폴리오 코치입니다. 다음 아티스트의 포트폴리오를 기반으로 소개 문구를 작성해주세요 (200-300자).
이름: ${artistName}
분야: ${fieldStr}
작품 설명: ${descriptions || "없음"}
종합 점수: ${score}점`;
  } else if (lang === "ja") {
    prompt = `あなたはArtLinkのポートフォリオコーチです。以下のアーティストのポートフォリオに基づいて紹介文を作成してください（200-300文字）。
名前: ${artistName}
分野: ${fieldStr}
作品説明: ${descriptions || "なし"}
総合スコア: ${score}点`;
  } else if (lang === "zh") {
    prompt = `你是ArtLink的作品集教练。请根据以下艺术家的作品集撰写简介（200-300字）。
姓名: ${artistName}
领域: ${fieldStr}
作品描述: ${descriptions || "无"}
综合评分: ${score}分`;
  } else {
    prompt = `You are ArtLink's portfolio coach. Write a portfolio introduction for the following artist (200-300 characters).
Name: ${artistName}
Fields: ${fieldStr}
Work descriptions: ${descriptions || "None"}
Overall score: ${score}`;
  }

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
  const lang = getAILanguage();
  const name = userProfile.name || (lang === "ko" ? "아티스트" : lang === "ja" ? "アーティスト" : lang === "zh" ? "艺术家" : "Artist");
  const genderLabel = getGenderLabel(userProfile.gender);
  const age = userProfile.birthDate ? (() => {
    const b = new Date(userProfile.birthDate);
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a > 0 ? a : null;
  })() : null;
  const heightStr = userProfile.height ? `${userProfile.height}cm` : "";
  const fieldLabels = (userProfile.fields || []).map((f) => getFieldLabel(f)).join(", ") || getFieldLabel("general");
  const specStr = (userProfile.specialties || []).slice(0, 5).join(", ");
  const careerStr = (userProfile.career || []).slice(0, 3).map((c) => `${c.title}(${c.role})`).join(", ");
  const score = artistProfile.overallScore || 0;

  if (lang === "ko") {
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

  if (lang === "ja") {
    const lines = [`[ArtLink プロフィールカード]`, ``, `名前: ${name}`];
    if (genderLabel || age) lines.push(`${genderLabel}${age ? ` / ${age}歳` : ""}${heightStr ? ` / ${heightStr}` : ""}`);
    lines.push(`分野: ${fieldLabels}`);
    if (specStr) lines.push(`特技: ${specStr}`);
    if (careerStr) lines.push(`主な経歴: ${careerStr}`);
    if (userProfile.school) lines.push(`学校: ${userProfile.school}`);
    if (userProfile.agency) lines.push(`所属: ${userProfile.agency}`);
    lines.push(`総合スコア: ${score}点`);
    lines.push(``);
    lines.push(`${name}さんは${fieldLabels}分野で活動しており、ポートフォリオ${portfolioItems.length}件の作品と継続的な記録を通じて独自の芸術世界を築いています。`);
    return lines.join("\n");
  }

  if (lang === "zh") {
    const lines = [`[ArtLink 个人资料卡]`, ``, `姓名: ${name}`];
    if (genderLabel || age) lines.push(`${genderLabel}${age ? ` / ${age}岁` : ""}${heightStr ? ` / ${heightStr}` : ""}`);
    lines.push(`领域: ${fieldLabels}`);
    if (specStr) lines.push(`特长: ${specStr}`);
    if (careerStr) lines.push(`主要经历: ${careerStr}`);
    if (userProfile.school) lines.push(`学校: ${userProfile.school}`);
    if (userProfile.agency) lines.push(`所属: ${userProfile.agency}`);
    lines.push(`综合评分: ${score}分`);
    lines.push(``);
    lines.push(`${name}在${fieldLabels}领域活动，通过${portfolioItems.length}件作品集作品和持续的记录，正在构建属于自己的艺术世界。`);
    return lines.join("\n");
  }

  // English
  const lines = [`[ArtLink Profile Card]`, ``, `Name: ${name}`];
  if (genderLabel || age) lines.push(`${genderLabel}${age ? ` / ${age} yrs` : ""}${heightStr ? ` / ${heightStr}` : ""}`);
  lines.push(`Fields: ${fieldLabels}`);
  if (specStr) lines.push(`Specialties: ${specStr}`);
  if (careerStr) lines.push(`Key career: ${careerStr}`);
  if (userProfile.school) lines.push(`School: ${userProfile.school}`);
  if (userProfile.agency) lines.push(`Agency: ${userProfile.agency}`);
  lines.push(`Overall score: ${score}`);
  lines.push(``);
  lines.push(`${name} is active in ${fieldLabels}, building a unique artistic identity through ${portfolioItems.length} portfolio works and consistent documentation.`);
  return lines.join("\n");
}

export async function generateStructuredPortfolio(userProfile, portfolioItems, artistProfile, savedNotes = []) {
  const lang = getAILanguage();
  const name = userProfile.name || (lang === "ko" ? "아티스트" : lang === "ja" ? "アーティスト" : lang === "zh" ? "艺术家" : "Artist");
  const fieldLabels = (userProfile.fields || []).map((f) => getFieldLabel(f)).join(", ");
  const specStr = (userProfile.specialties || []).join(", ");
  const careerStr = (userProfile.career || []).map((c) => `${c.title}(${c.role}, ${c.year})`).join("; ");

  let prompt;
  if (lang === "ko") {
    prompt = `당신은 ArtLink의 프로필 카드 작성 전문가입니다. 다음 아티스트의 구조화된 프로필 소개서를 300-500자로 작성해주세요.
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
  } else if (lang === "ja") {
    prompt = `あなたはArtLinkのプロフィールカード作成の専門家です。以下のアーティストの構造化されたプロフィール紹介文を300-500文字で作成してください。
名前: ${name}
性別: ${userProfile.gender || "未入力"}
年齢: ${userProfile.birthDate || "未入力"}
身長: ${userProfile.height || "未入力"}cm
分野: ${fieldLabels || "未入力"}
特技: ${specStr || "なし"}
経歴: ${careerStr || "なし"}
学校: ${userProfile.school || "未入力"}
所属事務所: ${userProfile.agency || "なし"}
総合スコア: ${artistProfile.overallScore || 0}点
ポートフォリオ: ${portfolioItems.length}件
ノート: ${savedNotes.length}件

プロフェッショナルかつ個性的なプロフィール紹介文を作成してください。`;
  } else if (lang === "zh") {
    prompt = `你是ArtLink的个人资料卡撰写专家。请为以下艺术家撰写300-500字的结构化个人简介。
姓名: ${name}
性别: ${userProfile.gender || "未填写"}
年龄: ${userProfile.birthDate || "未填写"}
身高: ${userProfile.height || "未填写"}cm
领域: ${fieldLabels || "未填写"}
特长: ${specStr || "无"}
经历: ${careerStr || "无"}
学校: ${userProfile.school || "未填写"}
所属公司: ${userProfile.agency || "无"}
综合评分: ${artistProfile.overallScore || 0}分
作品集: ${portfolioItems.length}件
笔记: ${savedNotes.length}篇

请撰写专业且有个性的个人简介。`;
  } else {
    prompt = `You are ArtLink's profile card specialist. Write a structured profile introduction of 300-500 characters for the following artist.
Name: ${name}
Gender: ${userProfile.gender || "Not specified"}
Age: ${userProfile.birthDate || "Not specified"}
Height: ${userProfile.height || "Not specified"}cm
Fields: ${fieldLabels || "Not specified"}
Specialties: ${specStr || "None"}
Career: ${careerStr || "None"}
School: ${userProfile.school || "Not specified"}
Agency: ${userProfile.agency || "None"}
Overall score: ${artistProfile.overallScore || 0}
Portfolio: ${portfolioItems.length} items
Notes: ${savedNotes.length}

Write a professional yet distinctive profile introduction.`;
  }

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
  const fieldLabel = getFieldLabel(field);
  const fmt = getResponseFormat();

  return `${fmt.videoRequestLabel(fieldLabel)}
${fmt.noteTitle(title)}
${fmt.noteContent(content)}

${fmt.videoFeedbackHeader(fieldLabel)}`;
}

function heuristicVideoFallback(field, videoCount) {
  const fieldLabel = getFieldLabel(field);
  const lang = getAILanguage();

  if (lang === "ko") {
    return `📌 ${fieldLabel} 연습 영상 ${videoCount}개가 첨부되었습니다.

💪 영상으로 기록하는 습관이 훌륭해요! 영상은 자신의 연습을 객관적으로 돌아볼 수 있는 최고의 도구입니다.

🎯 영상을 볼 때는 소리를 끄고 동작만, 또는 눈을 감고 소리만 각각 집중해서 관찰해보세요. 시각과 청각을 분리해서 분석하면 놓치고 있던 디테일을 발견할 수 있어요.

🎭 현재 AI 영상 분석 서비스에 접근할 수 없어 온디바이스 피드백을 드립니다. 네트워크 연결 상태를 확인하고 다시 시도해주세요.

🔜 오늘 영상을 일주일 후에 다시 보세요. 시간을 두고 보면 당시에는 몰랐던 성장 포인트가 보일 거예요.`;
  }

  if (lang === "ja") {
    return `📌 ${fieldLabel}の練習映像${videoCount}件が添付されました。

💪 映像で記録する習慣は素晴らしいです！映像は自分の練習を客観的に振り返る最高のツールです。

🎯 映像を見る際は、音を消して動きだけ、または目を閉じて音だけに集中して観察してみてください。視覚と聴覚を分離して分析すると、見落としていたディテールを発見できます。

🎭 現在AI映像分析サービスにアクセスできないため、オンデバイスフィードバックをお届けします。ネットワーク接続状態を確認してもう一度お試しください。

🔜 今日の映像を一週間後にもう一度見てください。時間を置いて見ると、当時は気づかなかった成長ポイントが見えてきます。`;
  }

  if (lang === "zh") {
    return `📌 已附加${videoCount}个${fieldLabel}练习视频。

💪 用视频记录的习惯非常好！视频是客观回顾自己练习的最佳工具。

🎯 观看视频时，试试关掉声音只看动作，或闭上眼睛只听声音。将视觉和听觉分开分析，可以发现之前忽略的细节。

🎭 当前无法访问AI视频分析服务，为您提供本地反馈。请检查网络连接状态后重试。

🔜 一周后再看看今天的视频。隔一段时间再看，会发现当时没注意到的成长点。`;
  }

  // English
  return `📌 ${videoCount} ${fieldLabel} practice video(s) attached.

💪 Great habit of recording with video! Video is the best tool for objectively reviewing your own practice.

🎯 When watching the video, try muting the sound to focus on movement only, or closing your eyes to focus on sound only. Analyzing visual and auditory elements separately can reveal details you've been missing.

🎭 The AI video analysis service is currently unavailable, so here's on-device feedback. Please check your network connection and try again.

🔜 Watch today's video again in a week. With some distance, you'll notice growth points you didn't see at the time.`;
}

/**
 * Upload video to server for Whisper transcription.
 * @param {string} videoUri - local file URI
 * @returns {Promise<string|null>} transcript text or null on failure
 */
async function transcribeVideo(videoUri) {
  let step = "init";
  try {
    let localUri = videoUri;
    if (!localUri.startsWith("file://")) {
      localUri = "file://" + localUri;
    }

    // Step 1: Upload to Supabase Storage using FileSystem.uploadAsync
    step = "upload";
    const fileName = `transcribe_${Date.now()}.mp4`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/temp-media/${fileName}`;

    const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "video/mp4",
        "x-upsert": "true",
      },
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      transcribeVideo._lastError = `upload ${uploadResult.status}: ${(uploadResult.body || "").slice(0, 100)}`;
      return null;
    }

    // Step 2: Call transcribe API
    step = "transcribe";
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/temp-media/${fileName}`;

    const res = await fetch(`${SERVER_URL}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: publicUrl }),
    });

    // Clean up after getting response
    fetch(`${SUPABASE_URL}/storage/v1/object/temp-media/${fileName}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    }).catch(() => {});

    if (res.ok) {
      const data = await res.json();
      return data.transcript || null;
    }
    const errBody = await res.text().catch(() => "");
    transcribeVideo._lastError = `transcribe ${res.status}: ${errBody.slice(0, 100)}`;
    return null;
  } catch (e) {
    transcribeVideo._lastError = `${step}: ${e.message}`;
    return null;
  }
}
transcribeVideo._lastError = "";

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
  const fmt = getResponseFormat();

  try {
    // Phase 1: Extract frames + transcribe in parallel (0-40%)
    onProgress?.({ phase: "extracting", percent: 5, message: fmt.progressExtract });

    const framePromise = extractVideoFrames(video.uri, durationSec);
    onProgress?.({ phase: "extracting", percent: 15, message: fmt.progressFrameExtract });

    // Transcription with 90s timeout (5min video: upload ~30s + Whisper ~30s)
    const transcribePromise = Promise.race([
      transcribeVideo(video.uri),
      new Promise((resolve) => setTimeout(() => resolve(null), 120000)),
    ]);
    onProgress?.({ phase: "extracting", percent: 20, message: fmt.progressAudioExtract });

    const [frames, transcript] = await Promise.all([framePromise, transcribePromise]);

    // Transcript is optional — dance/art videos may have no speech
    if (transcript) {
      onProgress?.({ phase: "extracting", percent: 40, message: fmt.progressPreDone });
    } else {
      onProgress?.({ phase: "extracting", percent: 40, message: fmt.progressFrameDone });
    }

    if (frames.length === 0) {
      console.log("[analyzeVideoFrames] No frames extracted");
      return heuristicVideoFallback(field, videos.length);
    }

    // Phase 2: Send to Claude Vision (40-95%)
    onProgress?.({ phase: "analyzing", percent: 45, message: fmt.progressAIRequest });

    const prompt = buildVideoPrompt(field, content, title);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 200000);

    try {
      onProgress?.({ phase: "analyzing", percent: 55, message: fmt.progressAIAnalyzing });

      const response = await fetch(`${SERVER_URL}/api/analyze-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          field,
          noteTitle: title || "",
          frames,
          ...(transcript ? { transcript } : {}),
        }),
        signal: controller.signal,
      });

      onProgress?.({ phase: "analyzing", percent: 85, message: fmt.progressResponse });

      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      onProgress?.({ phase: "done", percent: 100, message: fmt.progressDone });
      return data.analysis || heuristicVideoFallback(field, videos.length);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    if (e.name === "AbortError") {
      console.log("[analyzeVideoFrames] Timeout after 100s");
    } else {
      console.log("[analyzeVideoFrames] Error:", e.message);
    }
    return heuristicVideoFallback(field, videos.length);
  }
}

/**
 * Growth trajectory analysis request.
 * Collects notes with aiScores locally and sends to server.
 * @param {string} userId - auth user ID
 * @param {string} field - field
 * @param {Array} notes - savedNotes array
 * @returns {Promise<object>} { trajectory, pattern, potentialScore, vector, dataPoints, periodDays }
 */
export async function analyzeGrowth(userId, field, notes) {
  const fmt = getResponseFormat();

  // Filter notes with aiScores for the given field
  const scored = notes
    .filter((n) => n.aiScores && n.field === field)
    .map((n) => ({
      ...n.aiScores,
      createdAt: n.createdAt || n.id,
    }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (scored.length < 2) {
    return { error: fmt.growthMinError, minRequired: 2, current: scored.length };
  }

  const response = await fetch(`${SERVER_URL}/api/growth-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, field, scores: scored }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || fmt.growthFail);
  }

  return response.json();
}

/**
 * Similar growth trajectory matching request.
 * @param {string} userId - auth user ID
 * @param {string} [field] - filter by specific field (optional)
 * @returns {Promise<object>} { matches, myVector, myPattern, myPotentialScore }
 */
export async function matchGrowth(userId, field) {
  const fmt = getResponseFormat();
  const body = { userId };
  if (field) body.field = field;

  const response = await fetch(`${SERVER_URL}/api/growth-matching`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || fmt.matchFail);
  }

  return response.json();
}

export { FIELD_AI_PROMPTS };
