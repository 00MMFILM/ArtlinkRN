// 3단계 — 고칠 점 하나 고르기([[FOCUS]])와 지난 연습 비교(previous) 계약 테스트.
// 서버 계약: 본문 끝 `[[FOCUS]] 후보1 | 후보2 | 후보3` 한 줄 → 바로 다음 줄에 `[[SCORES]] ...`.
// 구서버 응답엔 FOCUS 줄이 없다(그때는 후보 없음 = 칩을 안 보여준다).
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  readAsStringAsync: jest.fn(async () => "base64"),
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1 })),
  deleteAsync: jest.fn(async () => {}),
  uploadAsync: jest.fn(async () => ({ status: 500, body: "" })),
  EncodingType: { Base64: "base64" },
  FileSystemUploadType: { MULTIPART: "multipart", BINARY_CONTENT: "binary" },
}));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(async (u) => ({ uri: u })), SaveFormat: { JPEG: "jpeg" } }));
jest.mock("react-native-compressor", () => ({ Video: { compress: jest.fn() } }));
jest.mock("../supabaseClient", () => ({ supabase: {}, SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "anon" }));
jest.mock("../apiConfig", () => ({
  SERVER_URL: "https://server.test",
  getApiHeaders: () => ({ "Content-Type": "application/json" }),
}));
jest.mock("../mauService", () => ({ getOrCreateDeviceId: jest.fn(async () => "device_test") }));
jest.mock("i18next", () => ({ language: "ko", t: (k) => k }));
jest.mock("../../utils/videoFrames", () => ({ extractVideoFrames: jest.fn() }));

const { parseFocus, focusSummary, changeSummary, buildPreviousContext, analyzeNote } = require("../aiService");

describe("failed recordings never spend an analysis request", () => {
  it("stops before AI when the recording upload fails", async () => {
    const fs = require("expo-file-system/legacy");
    fs.uploadAsync.mockResolvedValue({ status: 503 });
    global.fetch = jest.fn();
    await expect(analyzeNote("acting", "오늘 연습", [], {
      voiceRecordings: [{ uri: "file:///recording.m4a" }],
    }, {})).rejects.toThrow("AI_AUDIO_INCOMPLETE");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("AI stream needs a server completion event", () => {
  let xhr;
  const originalXHR = global.XMLHttpRequest;
  beforeEach(() => {
    global.XMLHttpRequest = jest.fn(() => (xhr = {
      open: jest.fn(), setRequestHeader: jest.fn(), send: jest.fn(),
      status: 200, responseText: "",
    }));
  });
  afterEach(() => { global.XMLHttpRequest = originalXHR; });

  it("accepts split JSON frames and takes the actual final model", async () => {
    const { streamAnalyze, lastAiMeta } = require("../aiService");
    const onToken = jest.fn();
    const result = streamAnalyze({}, onToken);
    const delta = JSON.stringify({ type: "delta", text: "이번 연습에서 호흡과 대사 전달이 좋았습니다." }) + "\n";
    xhr.responseText = delta.slice(0, 13);
    xhr.onprogress();
    expect(onToken).not.toHaveBeenCalled();
    xhr.responseText = delta;
    xhr.onprogress();
    xhr.responseText += JSON.stringify({ type: "done", model: "fallback-model", promptVersion: "v1" }) + "\n";
    xhr.onload();
    await expect(result).resolves.toContain("호흡");
    expect(lastAiMeta.model).toBe("fallback-model");
  });

  it.each(["missing", "error", "legacy"])("rejects %s completion even with more than ten characters", async (ending) => {
    const { streamAnalyze, lastAiMeta } = require("../aiService");
    lastAiMeta.model = "previous-model";
    const result = streamAnalyze({}, jest.fn());
    const rejection = expect(result).rejects.toThrow("AI_STREAM_INCOMPLETE");
    xhr.responseText = ending === "legacy" ? "중간에 끊겼지만 열 글자가 넘는 피드백" :
      JSON.stringify({ type: "delta", text: "중간에 끊겼지만 열 글자가 넘는 피드백" }) + "\n";
    if (ending === "error") xhr.responseText += JSON.stringify({ type: "error", error: "generation_failed" }) + "\n";
    xhr.onload();
    await rejection;
    expect(lastAiMeta.model).toBe("previous-model");
  });
});

describe("parseFocus — [[FOCUS]] 줄 파싱", () => {
  it("후보 3개를 뽑고 표시용 본문에선 제거한다", () => {
    const raw = "📌 전체 인상\n좋았어요.\n[[FOCUS]] 첫 문장 호흡 늦추기 | 상대 눈 보고 말하기 | 마지막 대사 볼륨 낮추기";
    const { analysis, options } = parseFocus(raw);
    expect(options).toEqual(["첫 문장 호흡 늦추기", "상대 눈 보고 말하기", "마지막 대사 볼륨 낮추기"]);
    expect(analysis).toBe("📌 전체 인상\n좋았어요.");
    expect(analysis).not.toContain("[[");
  });

  it("후보가 1개여도 된다", () => {
    const { options } = parseFocus("본문\n[[FOCUS]] 첫 문장 호흡 늦추기");
    expect(options).toEqual(["첫 문장 호흡 늦추기"]);
  });

  it("FOCUS 줄이 없으면(구서버) 후보는 비고 본문은 그대로", () => {
    const { analysis, options } = parseFocus("본문만 있는 피드백");
    expect(options).toEqual([]);
    expect(analysis).toBe("본문만 있는 피드백");
  });

  it("스트리밍 부분 수신: 잘린 마커가 본문에 남지 않는다", () => {
    expect(parseFocus("본문 도착 중\n[[FOC").analysis).toBe("본문 도착 중");
    const partial = parseFocus("본문\n[[FOCUS]] 첫 문장 호흡 늦추기 | 상대");
    expect(partial.analysis).toBe("본문");
    expect(partial.options).toEqual(["첫 문장 호흡 늦추기", "상대"]);
  });

  it("빈 입력에도 죽지 않는다", () => {
    expect(parseFocus("")).toEqual({ analysis: "", options: [] });
  });
});

describe("focusSummary / buildPreviousContext — 지난 연습 요약", () => {
  const comment = "📌 전체 인상\n좋다.\n💪 강점\n발음.\n🎯 개선 포인트\n첫 문장이 빠르다.\n🔜 다음 스텝\n천천히.";

  it("🎯 섹션만 뽑는다", () => {
    expect(focusSummary(comment)).toBe("개선 포인트\n첫 문장이 빠르다.");
  });

  it("🎯 섹션이 없으면 앞부분을 쓰고 길이를 제한한다", () => {
    expect(focusSummary("가".repeat(500), 400)).toHaveLength(400);
  });

  it("직전 노트로 previous 블록을 만든다", () => {
    const prev = { aiComment: comment, aiScores: { technique: 6 }, chosenFocus: "첫 문장 호흡 늦추기" };
    expect(buildPreviousContext(prev)).toEqual({
      focus: "첫 문장 호흡 늦추기",
      summary: "개선 포인트\n첫 문장이 빠르다.",
      scores: { technique: 6 },
    });
  });

  it("직전 노트가 없거나 비었으면 null", () => {
    expect(buildPreviousContext(null)).toBeNull();
    expect(buildPreviousContext({ title: "빈 노트" })).toBeNull();
  });
});

describe("재촬영 비교 — 개선점과 이번 변화를 구분한다", () => {
  const secondTake = "📌 전체 인상\n두 번째 연습.\n🎯 개선 포인트\n끝말을 더 또렷하게.\n🔁 지난 연습과 비교\n첫 문장의 속도가 안정됐다.\n🔜 다음 스텝\n호흡을 유지한다.";

  it("세 번째 분석의 previous 요약에 두 번째 분석의 🔁 변화 문장이 섞이지 않는다", () => {
    expect(focusSummary(secondTake)).toBe("개선 포인트\n끝말을 더 또렷하게.");
    const previous = buildPreviousContext({
      videoAnalysis: secondTake,
      chosenFocus: "끝말을 더 또렷하게",
    });
    expect(previous).toEqual({
      focus: "끝말을 더 또렷하게",
      summary: "개선 포인트\n끝말을 더 또렷하게.",
      scores: null,
    });
    expect(previous.summary).not.toContain("속도가 안정");
  });

  it("🔁 섹션만 보여주고 다음 스텝은 포함하지 않는다", () => {
    expect(changeSummary(secondTake)).toBe("지난 연습과 비교\n첫 문장의 속도가 안정됐다.");
  });

  it.each([null, undefined, "", "🎯 개선 포인트\n끝말을 더 또렷하게."])(
    "🔁 섹션이 없으면 전체 피드백으로 대신하지 않는다: %s",
    (text) => expect(changeSummary(text)).toBe("")
  );

  it.each(["📌", "💪", "🎯", "🎭", "🎨", "💡", "📈", "🔜", "🔁"])(
    "다음 알려진 섹션 %s 앞에서 끝난다",
    (next) => expect(changeSummary(`🔁 이번 변화\n호흡이 안정됐다.\n${next} 다른 섹션`)).toBe("이번 변화\n호흡이 안정됐다.")
  );

  it("마지막 섹션도 추출하고 기본 400자 및 요청한 길이를 지킨다", () => {
    expect(changeSummary("서문\n🔁   변화 한 줄   ")).toBe("변화 한 줄");
    expect(changeSummary("🔁 " + "가".repeat(500))).toHaveLength(400);
    expect(changeSummary("🔁 " + "나".repeat(500), 12)).toBe("나".repeat(12));
  });
});

describe("analyzeNote — 요청 바디 계약", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ analysis: "피드백 본문\n[[FOCUS]] 호흡 늦추기 | 시선 고정\n[[SCORES]] technique=6 expression=7 creativity=5 consistency=6 growth=7" }),
    }));
  });

  const bodyOf = () => JSON.parse(global.fetch.mock.calls[0][1].body);

  it("focus·previous가 있으면 싣고, wantFocus·wantScores를 항상 보낸다", async () => {
    const previous = { focus: "호흡", summary: "지난 요약", scores: { technique: 5 } };
    const result = await analyzeNote("acting", "본문", [], { title: "제목" }, {}, null, {
      focus: "첫 문장 호흡 늦추기",
      previous,
    });

    const body = bodyOf();
    expect(body.wantFocus).toBe(true);
    expect(body.wantScores).toBe(true);
    expect(body.focus).toBe("첫 문장 호흡 늦추기");
    expect(body.previous).toEqual(previous);

    // 응답 파싱: 본문에서 두 마커가 모두 제거되고 후보·점수가 분리된다
    expect(result.analysis).toBe("피드백 본문");
    expect(result.focusOptions).toEqual(["호흡 늦추기", "시선 고정"]);
    expect(result.scores.technique).toBe(6);
  });

  it("focus·previous가 없으면 아예 보내지 않는다", async () => {
    await analyzeNote("acting", "본문", [], { title: "제목" }, {});
    const body = bodyOf();
    expect("focus" in body).toBe(false);
    expect("previous" in body).toBe(false);
    expect(body.wantFocus).toBe(true);
  });
});

describe("parseFocus — 마커 없는 응답", () => {
  it("본문 중간의 [[대사]] 표기를 자르지 않는다", () => {
    const r = parseFocus("각본에 [[대사]] 표기가 있네요. 좋습니다.");
    expect(r.analysis).toBe("각본에 [[대사]] 표기가 있네요. 좋습니다.");
    expect(r.options).toEqual([]);
  });
  it("끝에 걸린 미완성 마커만 지운다", () => {
    expect(parseFocus("좋아요\n[[FOC").analysis).toBe("좋아요");
  });
});

// ─── 버그 수정 회귀 테스트 ───

const FileSystem = require("expo-file-system/legacy");
const { extractPdfText, stripMarkerLines, analyzeVideoFrames, PDF_EXTRACT_TIMEOUT_MS } = require("../aiService");
const { extractVideoFrames } = require("../../utils/videoFrames");

describe("항목5 — PDF 추출 타임아웃 (무한 로딩 방지)", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("60초를 넘기면 null을 주고 끝난다", async () => {
    jest.useFakeTimers();
    FileSystem.uploadAsync.mockReturnValue(new Promise(() => {})); // 영영 응답 없음

    const promise = extractPdfText("file:///a.pdf");
    await jest.advanceTimersByTimeAsync(PDF_EXTRACT_TIMEOUT_MS);

    await expect(promise).resolves.toBeNull();
  });

  it("PDF가 매달려도 analyzeNote는 PDF 텍스트 없이 끝까지 진행한다", async () => {
    jest.useFakeTimers();
    FileSystem.uploadAsync.mockReturnValue(new Promise(() => {}));
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ analysis: "피드백 본문" }) }));

    const promise = analyzeNote("acting", "본문", [], { title: "제목", pdfFiles: [{ uri: "file:///a.pdf", name: "a.pdf" }] }, {});
    await jest.advanceTimersByTimeAsync(PDF_EXTRACT_TIMEOUT_MS);
    const result = await promise;

    expect(result.analysis).toBe("피드백 본문");
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.prompt).toContain("본문");
    expect(body.prompt).not.toContain("a.pdf");
  });

  it("제때 응답하면 그대로 쓴다", async () => {
    FileSystem.uploadAsync.mockResolvedValue({ status: 200, body: JSON.stringify({ text: "대본 내용", pageCount: 2 }) });
    await expect(extractPdfText("file:///a.pdf")).resolves.toEqual({ text: "대본 내용", pageCount: 2 });
  });
});

describe("항목13 — 남은 [[SCORES]]·[[FOCUS]] 줄 최종 제거", () => {
  it("구분자가 어긋나 파싱에 실패한 줄도 통째로 지운다", () => {
    expect(stripMarkerLines("피드백 본문\n[[SCORES]] technique=6 expression=?")).toBe("피드백 본문");
    expect(stripMarkerLines("피드백 본문\n[[FOCUS]]\n다음 줄")).toBe("피드백 본문\n\n다음 줄");
  });

  it("본문 중간의 [[대사]] 같은 표기는 건드리지 않는다", () => {
    const text = "각본에 [[대사]] 표기가 있네요. 좋습니다.";
    expect(stripMarkerLines(text)).toBe(text);
  });

  it("마커가 없으면 원문 그대로 (공백도 안 건드린다)", () => {
    expect(stripMarkerLines("본문\n\n\n여백 유지")).toBe("본문\n\n\n여백 유지");
    expect(stripMarkerLines("")).toBe("");
    expect(stripMarkerLines(null)).toBeNull();
  });

  it("analyzeNote 응답에 깨진 마커가 와도 화면에 새지 않는다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ analysis: "피드백 본문\n[[SCORES]] technique=6 expression=7" }), // 5축이 안 맞아 파싱 실패
    }));
    const result = await analyzeNote("acting", "본문", [], { title: "제목" }, {});
    expect(result.analysis).toBe("피드백 본문");
    expect(result.analysis).not.toContain("[[SCORES]]");
  });
});

describe("항목14 — 타임아웃·재시도 정책", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    extractVideoFrames.mockResolvedValue({ frames: ["b64"], times: [0] });
    FileSystem.uploadAsync.mockResolvedValue({ status: 500, body: "" }); // 전사 생략
  });

  it("글 분석은 90초에 끊지 않고 130초까지 기다린다", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => {
        const e = new Error("Aborted");
        e.name = "AbortError";
        reject(e);
      });
    }));

    const promise = analyzeNote("acting", "본문", [], { title: "제목" }, {});
    const settled = jest.fn();
    promise.then(settled, settled);

    await jest.advanceTimersByTimeAsync(90000);
    expect(settled).not.toHaveBeenCalled(); // 예전 90초 타임아웃이면 여기서 끝났다

    await jest.advanceTimersByTimeAsync(40000);
    await expect(promise).rejects.toThrow();
    jest.useRealTimers();
  });

  it("영상 분석 504는 재시도하지 않는다 (쿼터 이중 차감 방지)", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 504, json: async () => ({}) }));

    await expect(
      analyzeVideoFrames("acting", "본문", "제목", [{ uri: "file:///a.mov", duration: 5000 }], {})
    ).rejects.toMatchObject({ videoAiReason: "TIMEOUT" });

    const analyzeCalls = global.fetch.mock.calls.filter((c) => String(c[0]).includes("/api/analyze-video"));
    expect(analyzeCalls).toHaveLength(1);
  });

  it("영상 분석 클라이언트 타임아웃(abort)도 재시도하지 않는다", async () => {
    global.fetch = jest.fn((url, opts) => {
      if (!String(url).includes("/api/analyze-video")) return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      const e = new Error("Aborted");
      e.name = "AbortError";
      return Promise.reject(e);
    });

    await expect(
      analyzeVideoFrames("acting", "본문", "제목", [{ uri: "file:///a.mov", duration: 5000 }], {})
    ).rejects.toMatchObject({ videoAiReason: "TIMEOUT" });

    const analyzeCalls = global.fetch.mock.calls.filter((c) => String(c[0]).includes("/api/analyze-video"));
    expect(analyzeCalls).toHaveLength(1);
  });

  it("그 밖의 5xx는 예전처럼 1회 재시도한다", async () => {
    global.fetch = jest.fn(async (url) => {
      if (!String(url).includes("/api/analyze-video")) return { ok: true, status: 200, json: async () => ({}) };
      return { ok: false, status: 500, json: async () => ({}) };
    });

    await expect(
      analyzeVideoFrames("acting", "본문", "제목", [{ uri: "file:///a.mov", duration: 5000 }], {})
    ).rejects.toMatchObject({ videoAiReason: "NETWORK" });

    const analyzeCalls = global.fetch.mock.calls.filter((c) => String(c[0]).includes("/api/analyze-video"));
    expect(analyzeCalls).toHaveLength(2);
  });
});

// 포트폴리오 AI는 429(한도 소진)를 실패로 삼켜 heuristic 문구를 돌려줬다.
// 사용자는 "AI가 대충 써줬다"로 보고, 한도를 썼다는 사실도 프리미엄 안내도 못 받았다(1.11.8).
describe("포트폴리오 AI는 429를 삼키지 않는다", () => {
  const { generatePortfolioSummary, generateStructuredPortfolio } = require("../aiService");
  const items = [{ type: "photo", field: "acting", description: "단편 주연" }];
  const profile = { name: "차서원", fields: ["acting"] };
  const stats = { overallScore: 70 };

  afterEach(() => { global.fetch = undefined; });

  it("generatePortfolioSummary: 429면 AI_QUOTA로 throw하고 used/max를 실어 보낸다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false, status: 429, json: async () => ({ used: 1, max: 1 }),
    }));
    await expect(generatePortfolioSummary(items, profile, stats)).rejects.toMatchObject({
      message: "AI_QUOTA", quotaUsed: 1, quotaMax: 1,
    });
  });

  it("generateStructuredPortfolio: 429면 AI_QUOTA로 throw한다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false, status: 429, json: async () => ({ used: 10, max: 10 }),
    }));
    await expect(generateStructuredPortfolio(profile, items, stats, [])).rejects.toThrow("AI_QUOTA");
  });

  it("429가 아닌 실패(500·네트워크)는 기존대로 heuristic 문구를 돌려준다", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(typeof (await generatePortfolioSummary(items, profile, stats))).toBe("string");
    global.fetch = jest.fn(async () => { throw new Error("offline"); });
    expect(typeof (await generateStructuredPortfolio(profile, items, stats, []))).toBe("string");
  });

  it("정상 응답은 그대로 쓴다", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, json: async () => ({ analysis: "AI 소개 문구" }),
    }));
    expect(await generatePortfolioSummary(items, profile, stats)).toBe("AI 소개 문구");
  });
});


describe("첫 체크인 메모가 모델 프롬프트에 전달된다", () => {
  const memo = "호흡을 길게 유지하며 발성 30분";
  it("본문이 비어도 제목에 저장된 메모를 실제 요청 prompt에 포함한다", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ analysis: "피드백 본문" }) }));
    await analyzeNote("music", "", [], { title: memo, content: "", type: "checkin" }, {});
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.prompt).toContain(`노트 제목: ${memo}`);
    expect(body.noteTitle).toBe(memo);
  });
  it("상세 화면의 스트리밍 요청도 같은 메모를 모델 prompt에 포함한다", async () => {
    const originalXHR = global.XMLHttpRequest;
    let requestBody;
    global.XMLHttpRequest = jest.fn(() => ({
      open: jest.fn(), setRequestHeader: jest.fn(), status: 200, responseText: "",
      send(body) {
        requestBody = JSON.parse(body);
        this.responseText = JSON.stringify({ type: "delta", text: "충분한 길이의 모의 피드백입니다." }) + "\n" + JSON.stringify({ type: "done", model: "mock-model", promptVersion: "test" }) + "\n";
        this.onload();
      },
    }));
    try {
      await analyzeNote("music", "", [], { title: memo, type: "checkin" }, {}, jest.fn());
      expect(requestBody.prompt).toContain(`노트 제목: ${memo}`);
    } finally { global.XMLHttpRequest = originalXHR; }
  });
});

describe("studio feedback language and evidence context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require("i18next").language = "ko";
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ analysis: "A practical next attempt." }) }));
  });

  it("uses English feedback for a Korean script without changing app language", async () => {
    await analyzeNote("acting", "다시 돌아올 거라고 믿었어.", [], {
      feedbackLanguage: "en", scriptLanguage: "ko",
      rehearsalContext: { role: "JIN", sceneTitle: "The Letter", scriptLanguage: "ko", feedbackLanguage: "en" },
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.feedbackLanguage).toBe("en");
    expect(body.prompt).toContain('"role":"JIN"');
    expect(body.prompt).toContain("not acoustic evidence");
    expect(require("i18next").language).toBe("ko");
  });

  it("keeps explicit Korean feedback when app and script are English", async () => {
    require("i18next").language = "en";
    await analyzeNote("acting", "I thought you would come back.", [], {}, {}, null, { feedbackLanguage: "ko" });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.feedbackLanguage).toBe("ko");
    expect(body.prompt).toContain("연기");
    expect(require("i18next").language).toBe("en");
  });

  it("ignores unsupported overrides and keeps the legacy request contract", async () => {
    await analyzeNote("acting", "오늘 연습", [], {}, {}, null, { feedbackLanguage: "anything", privateScript: "NEVER COPY" });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("feedbackLanguage");
    expect(body.prompt).not.toContain("NEVER COPY");
  });

  it("passes the same explicit language and selected role for video analysis", async () => {
    extractVideoFrames.mockResolvedValue({ frames: ["b64"], times: [0] });
    FileSystem.uploadAsync.mockResolvedValue({ status: 500, body: "" });
    await analyzeVideoFrames("acting", "영어 장면 연습", "Rehearsal", [{ uri: "file:///test.mov", duration: 5000 }], {}, null, {
      feedbackLanguage: "en", rehearsalContext: { role: "ALEX", scriptLanguage: "en", feedbackLanguage: "en" },
    });
    const call = global.fetch.mock.calls.find(([url]) => url.includes("/api/analyze-video"));
    const body = JSON.parse(call[1].body);
    expect(body.feedbackLanguage).toBe("en");
    expect(body.prompt).toContain('"role":"ALEX"');
    expect(body.prompt).toContain("do not infer pronunciation");
  });
});
