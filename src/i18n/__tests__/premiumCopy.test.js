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

// 결제해도 앱이 그대로이던 문제(2026-09-17) 수정으로 새로 쓰는 프리미엄 상태 문구.
// 10개 언어 전부에 있어야 한다 (en 폴백에 기대면 한국어 사용자 외에는 영어가 섞여 보인다).
const NEW_PREMIUM_KEYS = [
  "active_title",
  "active_plan_monthly",
  "active_plan_yearly",
  "active_plan_comp",
  "since",
  "next_billing",
  "manage",
  "badge",
  "limit_text_reached",
  "limit_video_reached",
];

describe("premium 상태 문구 — 10개 언어 전부 존재", () => {
  it.each(LOCALES)("%s: 새 premium 키가 모두 비어있지 않은 문자열이다", (code) => {
    const j = loadLocale(code);
    expect(j.premium).toBeDefined();
    NEW_PREMIUM_KEYS.forEach((k) => {
      expect(typeof j.premium[k]).toBe("string");
      expect(j.premium[k].trim().length).toBeGreaterThan(0);
    });
  });

  it.each(LOCALES)("%s: since/next_billing은 {{date}} 치환자를 갖는다", (code) => {
    const j = loadLocale(code);
    expect(j.premium.since).toEqual(expect.stringContaining("{{date}}"));
    expect(j.premium.next_billing).toEqual(expect.stringContaining("{{date}}"));
  });

  it.each(LOCALES)("%s: 소진 안내는 {{max}} 치환자를 갖는다 (서버 한도값을 그대로 쓴다)", (code) => {
    const j = loadLocale(code);
    expect(j.premium.limit_text_reached).toEqual(expect.stringContaining("{{max}}"));
    expect(j.premium.limit_video_reached).toEqual(expect.stringContaining("{{max}}"));
  });
});
