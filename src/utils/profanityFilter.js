// ─── Profanity Filter ─────────────────────────────────────
// 2-layer community moderation: Layer 1 (client-side instant block)
// Covers: Korean profanity, chosung bypasses, English patterns, spam patterns

// Korean profanity — specific compounds only (no single-char matches to avoid false positives)
const KOREAN_PROFANITY = [
  // 욕설/비속어 기본형
  "씨발", "시발", "씨bal", "sibal", "ssibal",
  "개새끼", "개세끼", "개색끼", "개섹끼",
  "병신", "븅신", "byungsin",
  "좆", "조까", "좃",
  "지랄", "지럴",
  "미친놈", "미친년", "미친새끼",
  "느금마", "느금",
  "엠창",
  "찐따", "찐다",
  "씹새", "씹년", "씹놈",
  "개놈", "개년",
  "새끼",
  "썅년", "썅놈",
  "쌍놈", "쌍년", "쌍욕",

  // 성적 표현
  "성매매", "원조교제", "조건만남",

  // 약물
  "마약", "필로폰", "히로뽕",

  // 혐오/차별
  "한남충", "한녀충", "맘충",
  "틀딱", "급식충",
  "재기해", "자살해",
];

// Regex patterns for words that need boundary awareness to avoid false positives
// e.g. "등신" should not match "등신불", "꺼져" should not match "불이 꺼져서"
const BOUNDARY_PATTERNS = [
  /(?:^|[\s,.!?])등신(?:$|[\s,.!?])/,
  /(?:^|[\s,.!?])꺼져(?:$|[\s,.!?])/,
  /(?:^|[\s,.!?])닥쳐(?:$|[\s,.!?])/,
  /(?:^|[\s,.!?])뒤져(?:$|[\s,.!?])/,
  /(?:^|[\s,.!?])개같(?:은|다|네)/,
  /\bporn/i,
  /\bsex(?:ual)?\b/i,
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bfuck/i,
];

// 초성 우회 패턴 (ㅅㅂ, ㅂㅅ, ㅈㄹ 등)
const CHOSUNG_PATTERNS = [
  /ㅅㅂ/, /ㅂㅅ/, /ㅈㄹ/, /ㅆㅂ/,
  /ㄱㅅㄲ/, /ㄱㅅ끼/,
  /ㅁㅊ/, /ㄲㅈ/, /ㄷㅊ/,
  /ㄴㄱㅁ/,
  /ㅅㄲ/,
];

// Regex patterns for bypass detection (spaces, dots, special chars inserted)
const BYPASS_PATTERNS = [
  // 씨발/시발 with inserted chars
  /[시씨][.\s_\-*@#!~]+[발빨팔]/,
  // 개새끼 with inserted chars
  /개[.\s_\-*@#!~]+새[.\s_\-*@#!~]*끼/,
  // 병신 with inserted chars
  /[병븅][.\s_\-*@#!~]+신/,
  // 지랄 with inserted chars
  /지[.\s_\-*@#!~]+[랄럴]/,
  // English bypass patterns
  /p\s*o\s*r\s*n/i,
  /f\s*u\s*c\s*k/i,
];

/**
 * Check text for profanity.
 * @param {string} text - Text to check
 * @returns {{ blocked: boolean, matched: string[] }}
 */
export function checkProfanity(text) {
  if (!text || typeof text !== "string") return { blocked: false, matched: [] };

  const normalized = text.toLowerCase().trim();
  const matched = [];

  // 1. Direct keyword match (exact substring — only safe compound words)
  for (const word of KOREAN_PROFANITY) {
    if (normalized.includes(word.toLowerCase())) {
      matched.push(word);
    }
  }

  // 2. Boundary-aware patterns (avoid false positives like 등신불, 불이 꺼져서)
  for (const pattern of BOUNDARY_PATTERNS) {
    if (pattern.test(normalized)) {
      matched.push(pattern.source);
    }
  }

  // 3. Chosung pattern match
  for (const pattern of CHOSUNG_PATTERNS) {
    if (pattern.test(normalized)) {
      matched.push(pattern.source);
    }
  }

  // 4. Bypass pattern match (space/special char insertion)
  for (const pattern of BYPASS_PATTERNS) {
    if (pattern.test(normalized)) {
      matched.push(pattern.source);
    }
  }

  return {
    blocked: matched.length > 0,
    matched: [...new Set(matched)],
  };
}
