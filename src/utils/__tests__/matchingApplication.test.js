import { safePostingUrl, resolveMatchingApplication, matchingDeadlineDays, isMatchingClosed, matchingSourceName } from "../matchingApplication";

it("preserves an HTTPS form with an email query", () => {
  const url = "https://example.org/apply?email=cast@example.org";
  expect(resolveMatchingApplication(url).href).toBe(url);
  expect(resolveMatchingApplication(url).kind).toBe("form");
});

it.each([
  "javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.org/",
  "https://user@example.org/", "https://example.org/\nform", "https://example.org/%0aform",
  "https://example.org\\@other.org/", "https://", "https://example.org:99999/", "//example.org/form",
])("does not open unsafe or invalid URL %s", (value) => {
  expect(safePostingUrl(value)).toBe("");
  expect(resolveMatchingApplication(value).href).toBe("");
});

it.each([
  "mailto:cast@example.org", "cast@example.org?bcc=other@example.org", "cast@example.org#bcc",
  "cast%0a@example.org", "cast@example.org\r\nbcc:other@example.org", "cast..film@example.org",
  "문의 cast@example.org, 지원 film@example.org", "010-1234-5678 또는 010-9876-5432",
])("keeps ambiguous or unsafe contact %s as text without inferring a target", (value) => {
  const result = resolveMatchingApplication(value, "https://example.org/post");
  expect(result.kind).toBe("text");
  expect(result.href).toBe("");
  expect(result.value).toBe(value);
  expect(result.sourceUrl).toBe("https://example.org/post");
});

it("handles null or non-string contact without throwing", () => {
  expect(resolveMatchingApplication({ email: "cast@example.org" }, "https://example.org/post").kind).toBe("source");
  expect(resolveMatchingApplication(null, null).kind).toBe("none");
});

it("matches Korean calendar midnight rather than the device timezone", () => {
  expect(matchingDeadlineDays("2026-09-26", Date.parse("2026-09-26T14:59:59Z"))).toBe(0);
  expect(matchingDeadlineDays("2026-09-26", Date.parse("2026-09-26T15:00:00Z"))).toBe(-1);
});

it.each(["2026-02-29", "2026-06-31", "2026-9-26", "", undefined])("does not infer a deadline from invalid date %s", (value) => {
  expect(matchingDeadlineDays(value)).toBeNull();
});

it("treats explicitly inactive posts as closed even when their date is in the future", () => {
  expect(isMatchingClosed({ status: "closed", deadline: "2099-01-01" })).toBe(true);
  expect(isMatchingClosed({ deadline: "2099-01-01" })).toBe(false);
});

describe.each([
  ["Node WHATWG", global.URL],
  ["Expo 54", require("expo/src/winter/url").URL],
])("application targets with %s installed as the global URL", (_, RuntimeURL) => {
  const originalURL = global.URL;
  beforeEach(() => { global.URL = RuntimeURL; });
  afterEach(() => { global.URL = originalURL; });

  it("opens a normal form without adding a slash to its path", () => {
    expect(resolveMatchingApplication("https://example.org/apply").href).toBe("https://example.org/apply");
  });

  it("keeps an email query in the form and displays the actual source hostname", () => {
    const url = "https://example.org/apply?email=cast@elsewhere.org";
    expect(resolveMatchingApplication(url).href).toBe(url);
    expect(matchingSourceName({ sourceUrl: url })).toBe("example.org");
  });

  it.each(["https://example.org:99999/", "https://user:password@example.org/", "https://example.org/%0d%0abcc=x", "https://%zz/"])(
    "rejects an unsafe URL %s", (url) => expect(safePostingUrl(url)).toBe("")
  );
});

it("Expo's actual installer replaces the simplified RN URL before handling application links", () => {
  // Startup: index.js -> expo/src/Expo.ts -> Expo.fx -> winter/runtime.native.ts.
  const originalURL = Object.getOwnPropertyDescriptor(global, "URL");
  const originalBackup = Object.getOwnPropertyDescriptor(global, "originalURL");
  const RNURL = require("react-native/Libraries/Blob/URL").URL;
  const ExpoURL = require("expo/src/winter/url").URL;
  try {
    global.URL = RNURL;
    require("expo/src/winter/installGlobal").installGlobal("URL", () => ExpoURL);
    expect(global.URL).toBe(ExpoURL);
    expect(safePostingUrl("https://example.org:99999/")).toBe("");
    expect(safePostingUrl("https://%zz/")).toBe("");
    expect(safePostingUrl("https://example.org/apply")).toBe("https://example.org/apply");
    expect(safePostingUrl("https://example.org/apply?email=a@b.org")).toBe("https://example.org/apply?email=a@b.org");
  } finally {
    Object.defineProperty(global, "URL", originalURL);
    if (originalBackup) Object.defineProperty(global, "originalURL", originalBackup);
    else delete global.originalURL;
  }
});

it("keeps an overlong email local part as text instead of launching mailto", () => {
  const email = `${"a".repeat(65)}@example.org`;
  expect(resolveMatchingApplication(email).kind).toBe("text");
  expect(resolveMatchingApplication(`${"a".repeat(64)}@example.org`).kind).toBe("email");
});
