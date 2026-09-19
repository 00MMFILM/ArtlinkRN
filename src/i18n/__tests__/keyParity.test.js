// ko.json을 정본으로 모든 언어 파일의 키가 누락 없이 존재하는지, 그리고
// AI 데이터 고지(aiDisclosure.message, eula_doc.article7_body)에 실제 처리자인
// Anthropic이 명시돼 있는지 검사한다.
const fs = require("fs");
const path = require("path");

const LOCALE_DIR = path.join(__dirname, "..", "locales");
const LOCALES = ["ar", "en", "es", "id", "ja", "ko", "th", "vi", "zh-CN", "zh-TW"];
const NON_KO_LOCALES = LOCALES.filter((l) => l !== "ko");

// 의도적으로 빈 문자열을 쓰는 키 (예: en의 home.suffix_nim은 존칭 접미사가 없어 빈 문자열)
const ALLOWED_EMPTY = new Set(["home.suffix_nim"]);

function loadLocale(code) {
  const raw = fs.readFileSync(path.join(LOCALE_DIR, `${code}.json`), "utf8");
  return JSON.parse(raw);
}

function flatten(obj, prefix = "") {
  const out = {};
  Object.keys(obj).forEach((k) => {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, full));
    } else {
      out[full] = v;
    }
  });
  return out;
}

describe("ko.json 기준 키 전수 존재", () => {
  const koFlat = flatten(loadLocale("ko"));
  const koKeys = Object.keys(koFlat);

  it.each(NON_KO_LOCALES)("%s: ko.json의 모든 키를 갖고 있다", (code) => {
    const flat = flatten(loadLocale(code));
    const missing = koKeys.filter((k) => !(k in flat));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)("%s: 값이 빈 문자열인 키가 허용 목록 외에는 없다", (code) => {
    const flat = flatten(loadLocale(code));
    const empty = Object.keys(flat).filter(
      (k) => flat[k] === "" && !ALLOWED_EMPTY.has(k)
    );
    expect(empty).toEqual([]);
  });
});

describe("AI 데이터 고지에 실제 처리자(Anthropic)가 명시되어 있다", () => {
  it.each(LOCALES)("%s: aiDisclosure.message에 Anthropic이 포함된다", (code) => {
    const j = loadLocale(code);
    expect(j.aiDisclosure?.message).toEqual(expect.stringContaining("Anthropic"));
  });

  it.each(LOCALES)("%s: eula_doc.article7_body에 Anthropic이 포함된다", (code) => {
    const j = loadLocale(code);
    expect(j.eula_doc?.article7_body).toEqual(expect.stringContaining("Anthropic"));
  });
});
