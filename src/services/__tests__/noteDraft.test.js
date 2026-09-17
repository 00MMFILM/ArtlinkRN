import {
  DRAFT_KEY,
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
