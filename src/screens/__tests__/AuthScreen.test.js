import React from "react";
import { Animated } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AuthScreen from "../AuthScreen";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../services/supabaseClient";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../../services/supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const handleAuth = jest.fn();
const buildCtx = (authUserId) => ({
  handleAuth,
  handleChangeLanguage: jest.fn(),
  language: "ko",
  userProfile: authUserId ? { authUserId } : {},
});

describe("AuthScreen — 가입 우선 + 2단계", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 페이드 전환 콜백을 즉시 실행 (애니메이션 대기 없이 단계 이동)
    jest.spyOn(Animated, "timing").mockImplementation(() => ({
      start: (cb) => cb && cb({ finished: true }),
    }));
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("계정이 없는 기기는 가입 폼이 먼저 보인다", () => {
    useApp.mockReturnValue(buildCtx(null));
    const { queryByText } = render(<AuthScreen navigation={{}} />);
    expect(queryByText("auth.step_basic")).toBeTruthy();
    expect(queryByText("auth.forgot_password")).toBeNull();
  });

  it("계정이 있는 기기는 로그인 폼이 먼저 보인다", () => {
    useApp.mockReturnValue(buildCtx("u1"));
    const { queryByText } = render(<AuthScreen navigation={{}} />);
    expect(queryByText("auth.forgot_password")).toBeTruthy();
    expect(queryByText("auth.step_basic")).toBeNull();
  });

  it("가입 폼 하단에 로그인 전환과 둘러보기가 있다", () => {
    useApp.mockReturnValue(buildCtx(null));
    const { getByText, queryByText } = render(<AuthScreen navigation={{}} />);
    expect(queryByText("auth.browse")).toBeTruthy();
    fireEvent.press(getByText("auth.login"));
    expect(queryByText("auth.forgot_password")).toBeTruthy();
  });

  it("가입은 2단계 — 기본정보 다음이 유형·분야이고 그 다음이 완료다", async () => {
    useApp.mockReturnValue(buildCtx(null));
    const { getByText, getByPlaceholderText, queryByText } = render(
      <AuthScreen navigation={{}} />
    );

    expect(queryByText("1 / 2")).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText("auth.name_placeholder"), "홍길동");
    fireEvent.changeText(getByPlaceholderText("email@example.com"), "a@b.com");
    fireEvent.changeText(getByPlaceholderText("auth.password_min_hint"), "secret123");
    fireEvent.changeText(getByPlaceholderText("auth.password_confirm_placeholder"), "secret123");
    fireEvent.press(getByText("common.next"));

    // 단계 1 = 유형 + 분야 한 화면
    expect(queryByText("2 / 2")).toBeTruthy();
    expect(queryByText("auth.step_usertype")).toBeTruthy();
    expect(queryByText("auth.step_fields")).toBeTruthy();

    fireEvent.press(getByText("auth.usertype_aspiring"));
    fireEvent.press(getByText("auth.field_acting"));

    // 마지막 단계 → 버튼이 '시작'이고 누르면 가입 완료
    fireEvent.press(getByText("auth.start"));
    await waitFor(() => expect(handleAuth).toHaveBeenCalled());

    const profile = handleAuth.mock.calls[0][0];
    expect(profile.userType).toBe("aspiring");
    expect(profile.fields).toEqual(["acting"]);
    // 삭제된 단계 항목은 빈값으로 유지 (서버 스키마 호환)
    expect(profile.photos).toEqual([]);
    expect(profile.career).toEqual([]);
    expect(profile.height).toBeNull();
  });
});
