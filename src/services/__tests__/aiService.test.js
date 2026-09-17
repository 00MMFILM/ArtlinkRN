// 3단계 — 고칠 점 하나 고르기([[FOCUS]])와 지난 연습 비교(previous) 계약 테스트.
// 서버 계약: 본문 끝 `[[FOCUS]] 후보1 | 후보2 | 후보3` 한 줄 → 바로 다음 줄에 `[[SCORES]] ...`.
// 구서버 응답엔 FOCUS 줄이 없다(그때는 후보 없음 = 칩을 안 보여준다).
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  readAsStringAsync: jest.fn(async () => "base64"),
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1 })),
  deleteAsync: jest.fn(async () => {}),
  EncodingType: { Base64: "base64" },
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

const { parseFocus, focusSummary, buildPreviousContext, analyzeNote } = require("../aiService");

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
