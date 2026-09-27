import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import FirstCheckinScreen from "../FirstCheckinScreen";
import { useApp } from "../../context/AppContext";
import { trackFunnelEvent } from "../../services/mauService";
import { startPractice, completePractice, abandonPractice } from "../../services/practiceService";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("i18next", () => ({ t: (k) => k, language: "ko" }));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/practiceService", () => ({
  startPractice: jest.fn(() => ({ sessionId: "sess-first", kind: "checkin" })),
  completePractice: jest.fn(),
  abandonPractice: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const buildCtx = (overrides = {}) => ({
  userProfile: { name: "홍길동", fields: ["music"] },
  fieldOrder: ["acting", "music", "art"],
  handleSaveNote: jest.fn(async () => 777),
  dismissFirstCheckin: jest.fn(),
  showToast: jest.fn(),
  ...overrides,
});

const navigation = { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

describe("FirstCheckinScreen — 첫 체크인", () => {
  beforeEach(() => jest.clearAllMocks());

  it("프로필 분야가 미리 선택된 채로 뜨고 노출 이벤트를 보낸다", () => {
    useApp.mockReturnValue(buildCtx());
    const { getByText } = render(<FirstCheckinScreen navigation={navigation} />);

    expect(getByText("first_checkin.title")).toBeTruthy();
    expect(getByText("first_checkin.save")).toBeTruthy();
    expect(getByText("first_checkin.later")).toBeTruthy();
    expect(trackFunnelEvent).toHaveBeenCalledWith("first_checkin_shown", "ko");
  });

  it("저장하면 체크인 노트 1건 + 연습 완료 + first_checkin_saved", async () => {
    const ctx = buildCtx();
    useApp.mockReturnValue(ctx);
    const { getByText, getByPlaceholderText } = render(<FirstCheckinScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText("first_checkin.memo_placeholder"), "발성 30분");
    await act(async () => { fireEvent.press(getByText("first_checkin.save")); });

    expect(ctx.handleSaveNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: "발성 30분", field: "music", type: "checkin", practiceSessionId: "sess-first" })
    );
    expect(completePractice).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("note_saved", "ko");
    expect(trackFunnelEvent).toHaveBeenCalledWith("first_checkin_saved", "ko");
  });

  it("고른 분야로 저장된다", async () => {
    const ctx = buildCtx();
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<FirstCheckinScreen navigation={navigation} />);

    fireEvent.press(getByText(/fields.acting/));
    await act(async () => { fireEvent.press(getByText("first_checkin.save")); });

    expect(ctx.handleSaveNote).toHaveBeenCalledWith(expect.objectContaining({ field: "acting" }));
  });

  it("저장 후에는 완료 메시지와 AI 피드백·홈으로가 보인다", async () => {
    useApp.mockReturnValue(buildCtx());
    const { getByText, queryByText } = render(<FirstCheckinScreen navigation={navigation} />);

    await act(async () => { fireEvent.press(getByText("first_checkin.save")); });

    expect(getByText("first_checkin.done_title")).toBeTruthy();
    expect(getByText("first_checkin.ai_cta")).toBeTruthy();
    expect(getByText("first_checkin.home_cta")).toBeTruthy();
    expect(queryByText("first_checkin.save")).toBeNull();
  });

  // AI 분석은 노트 화면에서 사용자가 직접 누른다 — 여기서 자동으로 발사하지 않는다
  it("AI 피드백 버튼은 홈을 뒤로가기 대상으로 남기고 저장한 노트의 AI 탭을 연다", async () => {
    useApp.mockReturnValue(buildCtx());
    const { getByText } = render(<FirstCheckinScreen navigation={navigation} />);

    await act(async () => { fireEvent.press(getByText("first_checkin.save")); });
    fireEvent.press(getByText("first_checkin.ai_cta"));

    expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: "MainTabs" }, { name: "NoteDetail", params: { noteId: 777, initialTab: "ai" } }],
    });
  });

  it("홈으로를 누르면 화면이 닫힌다", async () => {
    const ctx = buildCtx();
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<FirstCheckinScreen navigation={navigation} />);

    await act(async () => { fireEvent.press(getByText("first_checkin.save")); });
    fireEvent.press(getByText("first_checkin.home_cta"));

    expect(ctx.dismissFirstCheckin).toHaveBeenCalled();
  });

  it("나중에를 누르면 노트를 만들지 않고 닫히고 first_checkin_skipped를 보낸다", () => {
    const ctx = buildCtx();
    useApp.mockReturnValue(ctx);
    const { getByText } = render(<FirstCheckinScreen navigation={navigation} />);

    fireEvent.press(getByText("first_checkin.later"));

    expect(ctx.handleSaveNote).not.toHaveBeenCalled();
    expect(ctx.dismissFirstCheckin).toHaveBeenCalled();
    expect(trackFunnelEvent).toHaveBeenCalledWith("first_checkin_skipped", "ko");
  });

  it("메모를 쓰기 시작할 때 세션이 열리고, 저장 없이 떠나면 이탈 1건", () => {
    useApp.mockReturnValue(buildCtx());
    const { getByPlaceholderText, unmount } = render(<FirstCheckinScreen navigation={navigation} />);

    fireEvent(getByPlaceholderText("first_checkin.memo_placeholder"), "focus");
    expect(startPractice).toHaveBeenCalledWith("checkin", "music", "music");

    unmount();
    expect(abandonPractice).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-first" }));
  });

  it("저장이 실패하면 완료 화면으로 넘어가지 않고 안내만 한다", async () => {
    const ctx = buildCtx({ handleSaveNote: jest.fn(async () => { throw new Error("nope"); }) });
    useApp.mockReturnValue(ctx);
    const { getByText, queryByText } = render(<FirstCheckinScreen navigation={navigation} />);

    await act(async () => { fireEvent.press(getByText("first_checkin.save")); });

    expect(ctx.showToast).toHaveBeenCalledWith("common.save_failed_msg", "error");
    expect(queryByText("first_checkin.done_title")).toBeNull();
    expect(ctx.dismissFirstCheckin).not.toHaveBeenCalled();
  });
});
