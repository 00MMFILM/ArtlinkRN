import {
  DRAFT_KEY,
  hasDraftContent,
  buildDraft,
  validateDraft,
  saveDraft,
  loadDraft,
  clearDraft,
} from "../noteDraft";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = {};
  return {
    getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k, v) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k) => {
      delete store[k];
    }),
    __store: store,
  };
});

const AsyncStorage = require("@react-native-async-storage/async-storage");

const fullState = {
  title: "연습 기록",
  content: "",
  field: "acting",
  tags: ["독백"],
  seriesName: "햄릿",
  aiComment: "좋아요",
  aiScores: { total: 80 },
  videoAnalysis: "영상 분석 결과",
  images: [{ uri: "file:///media/a.mov", type: "video" }],
  voiceRecordings: [{ uri: "file:///media/b.m4a", duration: 3 }],
  audioFiles: [{ uri: "file:///media/c.mp3", name: "c.mp3" }],
  pdfFiles: [{ uri: "file:///media/d.pdf", name: "d.pdf" }],
};

describe("noteDraft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
  });

  it("restores rehearsal language/role and application requirements after a signup draft round trip", async () => {
    const meta = {
      feedbackLanguage: "ko", scriptLanguage: "en",
      rehearsalContext: { sceneTitle: "Original scene", role: "Lear", scriptLanguage: "en", feedbackLanguage: "ko" },
      applicationContext: { postId: "casting-1", title: "Film", country: "UK", submissions: ["Self-tape", "CV"] },
    };
    await expect(saveDraft({ ...fullState, ...meta, unknown: true })).resolves.toBe(true);
    expect(await loadDraft()).toEqual(expect.objectContaining(meta));
    const contaminated = { ...buildDraft(fullState), ...meta, rehearsalContext: { ...meta.rehearsalContext, recording: "file:///old" } };
    const restored = validateDraft(contaminated);
    expect(restored.rehearsalContext).toEqual(meta.rehearsalContext);
    expect(restored.unknown).toBeUndefined();
  });

  it("buildDraft는 알려진 필드 + savedAt만 담는다", () => {
    const draft = buildDraft({ ...fullState, tagInput: "버려질값", aiLoading: true });
    expect(draft.tagInput).toBeUndefined();
    expect(draft.aiLoading).toBeUndefined();
    expect(draft.title).toBe("연습 기록");
    expect(draft.images).toHaveLength(1);
    expect(typeof draft.savedAt).toBe("number");
  });

  it("validateDraft는 빈 초안·깨진 값을 거른다", () => {
    expect(validateDraft(null)).toBeNull();
    expect(validateDraft("문자열")).toBeNull();
    expect(validateDraft({})).toBeNull();
    expect(validateDraft({ title: "   ", content: "", images: [] })).toBeNull();
    // 제목만 있어도 내용이 없으면 보관할 가치가 없다
    expect(validateDraft({ title: "제목만" })).toBeNull();
    expect(validateDraft({ content: "본문" })).not.toBeNull();
    expect(validateDraft({ images: [{ uri: "file:///a.mov" }] })).not.toBeNull();
    // 배열이어야 할 자리에 다른 게 오면 빈 배열로 정규화
    const d = validateDraft({ content: "본문", tags: "not-array", images: null });
    expect(d.tags).toEqual([]);
    expect(d.images).toEqual([]);
  });

  it("saveDraft는 저장 후 되읽어 확인하고 true를 준다", async () => {
    await expect(saveDraft(fullState)).resolves.toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(DRAFT_KEY, expect.any(String));
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(DRAFT_KEY);

    const loaded = await loadDraft();
    expect(loaded.videoAnalysis).toBe("영상 분석 결과");
    expect(loaded.images[0].uri).toBe("file:///media/a.mov");
    expect(loaded.voiceRecordings[0].duration).toBe(3);
    expect(loaded.audioFiles[0].name).toBe("c.mp3");
    expect(loaded.pdfFiles[0].name).toBe("d.pdf");
    expect(loaded.aiScores).toEqual({ total: 80 });
  });

  it("setItem이 실패하면 false — 저장됐다고 거짓말하지 않는다", async () => {
    AsyncStorage.setItem.mockRejectedValueOnce(new Error("quota"));
    await expect(saveDraft(fullState)).resolves.toBe(false);
    expect(await loadDraft()).toBeNull();
  });

  it("되읽은 값이 다르면 false", async () => {
    AsyncStorage.getItem.mockResolvedValueOnce("{}");
    await expect(saveDraft(fullState)).resolves.toBe(false);
  });

  it("저장할 내용이 없으면 저장하지 않고 false", async () => {
    await expect(saveDraft({ title: "", content: "  " })).resolves.toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("clearDraft는 키를 지운다", async () => {
    await saveDraft(fullState);
    await clearDraft();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DRAFT_KEY);
    expect(await loadDraft()).toBeNull();
  });

  it("깨진 JSON이 들어 있으면 loadDraft는 null", async () => {
    AsyncStorage.__store[DRAFT_KEY] = "{깨짐";
    expect(await loadDraft()).toBeNull();
  });
});

describe("hasDraftContent", () => {
  const { hasDraftContent } = require("../noteDraft");
  it("내용이 없으면 false, 첨부·본문·분석이 있으면 true", () => {
    expect(hasDraftContent({})).toBe(false);
    expect(hasDraftContent({ title: "제목만" })).toBe(false);
    expect(hasDraftContent({ content: "본문" })).toBe(true);
    expect(hasDraftContent({ voiceRecordings: [{ uri: "a" }] })).toBe(true);
    expect(hasDraftContent({ videoAnalysis: "분석" })).toBe(true);
  });
});

describe("고칠 점 후보·선택 보존", () => {
  it("초안 왕복에서 focusOptions와 chosenFocus가 살아남는다", () => {
    const draft = validateDraft(JSON.parse(JSON.stringify(buildDraft({
      ...fullState, focusOptions: ["호흡 늦추기", "시선 고정", 3], chosenFocus: "시선 고정",
    }))));
    expect(draft.focusOptions).toEqual(["호흡 늦추기", "시선 고정"]);
    expect(draft.chosenFocus).toBe("시선 고정");
  });
});

describe("초안 만료 (7일)", () => {
  const { DRAFT_TTL_MS } = require("../noteDraft");

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(AsyncStorage.__store).forEach((k) => delete AsyncStorage.__store[k]);
  });

  it("7일보다 오래된 초안은 validateDraft가 null", () => {
    const stale = { ...buildDraft(fullState), savedAt: Date.now() - DRAFT_TTL_MS - 1000 };
    expect(validateDraft(stale)).toBeNull();
  });

  it("7일 안쪽이면 그대로 살아 있다", () => {
    const fresh = { ...buildDraft(fullState), savedAt: Date.now() - DRAFT_TTL_MS + 60000 };
    expect(validateDraft(fresh)).not.toBeNull();
  });

  it("savedAt이 없거나 0인 구버전 초안은 유효로 본다", () => {
    expect(validateDraft({ content: "본문" })).not.toBeNull();
    expect(validateDraft({ content: "본문", savedAt: 0 })).not.toBeNull();
  });

  it("만료된 초안은 loadDraft가 저장소에서도 지운다", async () => {
    AsyncStorage.__store[DRAFT_KEY] = JSON.stringify({
      ...buildDraft(fullState),
      savedAt: Date.now() - DRAFT_TTL_MS - 1,
    });

    expect(await loadDraft()).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(DRAFT_KEY);
    expect(AsyncStorage.__store[DRAFT_KEY]).toBeUndefined();
  });
});

describe("retake intent before capture", () => {
  it("preserves a parent and focus before recording, but not an empty title-only draft", () => {
    const draft = buildDraft({ title: "독백", parentNoteId: 123, rootNoteId: 100, sceneId: "hamlet", focus: "호흡" });
    expect(hasDraftContent(draft)).toBe(true);
    expect(validateDraft(draft)).toEqual(expect.objectContaining({ parentNoteId: 123, rootNoteId: 100, sceneId: "hamlet", focus: "호흡" }));
    expect(hasDraftContent({ title: "독백" })).toBe(false);
    expect(hasDraftContent({ parentNoteId: 123, focus: " " })).toBe(false);
    expect(hasDraftContent({ parentNoteId: {}, focus: "호흡" })).toBe(false);
  });
});


it("preserves video result metadata through signup draft serialization", () => {
  const draft = validateDraft(buildDraft({ videoAnalysis: "feedback", aiModel: "model-a", promptVersion: "v3", transcript: "spoken words" }));
  expect(draft).toEqual(expect.objectContaining({ aiModel: "model-a", promptVersion: "v3", transcript: "spoken words" }));
});
