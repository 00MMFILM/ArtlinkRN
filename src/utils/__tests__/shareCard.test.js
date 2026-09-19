// 항목9: 공유 불가 환경에서 조용히 {shared:false}만 돌려주던 문제 — reason을 실어 호출부가 알 수 있게 한다.
// 항목10: 카드 문구(섹션 헤더·분야 라벨·날짜)가 한국어로 하드코딩돼 있던 문제 — i18n으로 뺀다.
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import i18n from "../../i18n";
import { buildCardProps, shareCardImage } from "../shareCard";

jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("../../i18n", () => ({
  t: jest.fn((k, opts) => (opts ? `${k}:${JSON.stringify(opts)}` : k)),
  language: "ko",
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("shareCardImage — 공유 불가 사유 전달", () => {
  it("공유 시트를 쓸 수 있으면 {shared:true}", async () => {
    captureRef.mockResolvedValue("file:///tmp/card.png");
    Sharing.isAvailableAsync.mockResolvedValue(true);
    const result = await shareCardImage({}, "feed");
    expect(Sharing.shareAsync).toHaveBeenCalled();
    expect(result).toEqual({ shared: true });
  });

  it("공유 시트를 쓸 수 없으면 reason:'unavailable'을 포함해 돌려준다 (조용한 무반응 금지)", async () => {
    captureRef.mockResolvedValue("file:///tmp/card.png");
    Sharing.isAvailableAsync.mockResolvedValue(false);
    const result = await shareCardImage({}, "feed");
    expect(result.shared).toBe(false);
    expect(result.reason).toBe("unavailable");
  });
});

describe("buildCardProps — i18n", () => {
  it("분야 라벨은 fields.* 키로 번역한다", () => {
    const props = buildCardProps({ field: "acting", title: "제목", aiComment: "" }, "feed");
    expect(i18n.t).toHaveBeenCalledWith("fields.acting", { defaultValue: "연기" });
    expect(props.fieldLabel).toBe("fields.acting:{\"defaultValue\":\"연기\"}");
  });

  it("섹션 헤더는 shareCard.section_* 키를 쓴다", () => {
    buildCardProps({ field: "acting", title: "제목", aiComment: "📌관찰내용\n💪강점내용\n🎯다음스텝" }, "story");
    expect(i18n.t).toHaveBeenCalledWith("shareCard.section_observation");
    expect(i18n.t).toHaveBeenCalledWith("shareCard.section_strength");
    expect(i18n.t).toHaveBeenCalledWith("shareCard.section_next");
  });

  it("제목이 없으면 shareCard.practice_title로 대체한다", () => {
    const props = buildCardProps({ field: "music", title: "", aiComment: "" }, "feed");
    expect(i18n.t).toHaveBeenCalledWith("shareCard.practice_title", { field: expect.any(String) });
    expect(props.title).toContain("shareCard.practice_title");
  });

  it("날짜는 i18n.language 기준 toLocaleDateString으로 만든다", () => {
    const spy = jest.spyOn(Date.prototype, "toLocaleDateString");
    buildCardProps({ field: "acting", title: "제목", aiComment: "" }, "feed");
    expect(spy).toHaveBeenCalledWith("ko", { month: "long", day: "numeric" });
    spy.mockRestore();
  });
});
