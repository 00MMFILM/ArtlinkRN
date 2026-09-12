// 프리미엄 안내 문구가 실제 서버 한도(텍스트 하루 10회, 영상 월 15회)와 일치하는지 검사.
// 서버 정본: artlink-server/api/_usage.js (PREMIUM_TEXT_DAILY=10, PREMIUM_VIDEO_MONTHLY=15)
const fs = require("fs");
const path = require("path");

const LOCALE_DIR = path.join(__dirname, "..", "locales");
const LOCALES = ["ar", "en", "es", "id", "ja", "ko", "th", "vi", "zh-CN", "zh-TW"];

// "무제한"류 단어 (한/영/기타 언어 공통으로 자주 쓰이는 표기) — 실제 한도 안내 문구에 남아있으면 안 됨
const UNLIMITED_WORDS = [
  "무제한", "제한 없이", "제한없이",
  "unlimited", "without limit",
  "无限", "無限", "不限",
  "không giới hạn",
  "ไม่จำกัด",
  "tanpa batas",
  "غير محدود",
  "sin límite", "ilimitad",
];

function containsUnlimitedWord(text) {
  const lower = String(text).toLowerCase();
  return UNLIMITED_WORDS.some((w) => lower.includes(w.toLowerCase()));
}

function loadLocale(code) {
  const raw = fs.readFileSync(path.join(LOCALE_DIR, `${code}.json`), "utf8");
  return JSON.parse(raw); // JSON 유효성 검사도 겸함
}

describe("locale JSON 유효성", () => {
  it.each(LOCALES)("%s.json 은 유효한 JSON이다", (code) => {
    expect(() => loadLocale(code)).not.toThrow();
  });
});

describe("common.video_quota_exceeded — 실제 한도(월 15회) 반영", () => {
  it.each(LOCALES)("%s: '무제한' 계열 표현이 없다", (code) => {
    const j = loadLocale(code);
    const text = j.common?.video_quota_exceeded;
    expect(typeof text).toBe("string");
    expect(containsUnlimitedWord(text)).toBe(false);
  });

  it.each(LOCALES)("%s: 숫자 15가 포함되어 있다 (월 15회 안내)", (code) => {
    const j = loadLocale(code);
    const text = j.common?.video_quota_exceeded;
    expect(text).toEqual(expect.stringContaining("15"));
  });
});

describe("premium.subtitle / premium.benefit_text — 실제 한도(하루 10회) 반영 (ko, en)", () => {
  it.each(["ko", "en"])("%s: subtitle/benefit_text에 '무제한' 계열 표현이 없다", (code) => {
    const j = loadLocale(code);
    expect(containsUnlimitedWord(j.premium.subtitle)).toBe(false);
    expect(containsUnlimitedWord(j.premium.benefit_text)).toBe(false);
  });

  it.each(["ko", "en"])("%s: subtitle/benefit_text에 숫자 10이 포함되어 있다 (하루 10회 안내)", (code) => {
    const j = loadLocale(code);
    expect(j.premium.subtitle).toEqual(expect.stringContaining("10"));
    expect(j.premium.benefit_text).toEqual(expect.stringContaining("10"));
  });
});
