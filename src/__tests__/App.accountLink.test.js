import React from "react";
import { Alert, Linking } from "react-native";
import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }) => children,
  createNavigationContainerRef: () => ({ isReady: () => true, getRootState: () => ({ routeNames: ["NoteCreate"] }), navigate: mockNavigate, dispatch: mockDispatch }),
  StackActions: { push: (name, params) => ({ type: "PUSH", payload: { name, params } }) },
}));
jest.mock("@react-navigation/native-stack", () => ({ createNativeStackNavigator: () => ({ Navigator: ({ children }) => children, Screen: () => null }) }));
jest.mock("@react-navigation/bottom-tabs", () => ({ createBottomTabNavigator: () => ({ Navigator: ({ children }) => children, Screen: () => null }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("expo-linking", () => ({ getInitialURL: jest.fn(async () => null), parse: jest.fn() }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-google-mobile-ads", () => () => ({ initialize: jest.fn() }));
jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(async () => "true"), setItem: jest.fn(async () => {}) }));
jest.mock("../i18n", () => ({ initI18n: jest.fn(async () => {}) }));
jest.mock("../context/AppContext", () => ({ useApp: jest.fn(), AppProvider: ({ children }) => children }));
jest.mock("../services/supabaseClient", () => ({ supabase: { auth: { signUp: jest.fn() } } }));
jest.mock("../services/mauService", () => ({ trackFunnelEvent: jest.fn() }));
jest.mock("../services/noteDraft", () => ({ loadDraft: jest.fn(async () => null) }));
jest.mock("../services/practiceService", () => ({ flushPracticeQueue: jest.fn() }));
jest.mock("../services/purchasesService", () => ({ initPurchases: jest.fn(), logInPurchases: jest.fn() }));
jest.mock("../components/Toast", () => () => null);
[
  "AuthScreen", "HomeScreen", "NotesScreen", "NoteCreateScreen", "NoteDetailScreen", "CommunityScreen", "ProfileScreen",
  "GrowthScreen", "DuetPracticeScreen", "MatchingScreen", "ShareCardScreen", "PortfolioScreen", "GoalsScreen", "SubscriptionScreen",
  "NotificationsScreen", "B2BDashboardScreen", "DevRoadmapScreen", "OnboardingScreen", "MatchingPostCreateScreen", "ProfileEditScreen",
  "EULAScreen", "CommunityPostDetailScreen", "CommunityPostCreateScreen", "MatchingPostDetailScreen", "InboxScreen",
].forEach((screen) => jest.doMock(`../screens/${screen}`, () => () => null));
const { AppNavigator } = require("../../App");
const { useApp } = require("../context/AppContext");
const { supabase } = require("../services/supabaseClient");
const { loadDraft } = require("../services/noteDraft");
const { initPurchases, logInPurchases } = require("../services/purchasesService");
const ExpoLinking = require("expo-linking");
const { trackFunnelEvent } = require("../services/mauService");
let context;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "addEventListener").mockReturnValue({ remove: jest.fn() });
  context = { authState: "app", storageReady: true, eulaAccepted: true, userProfile: { email: "member@example.test", name: "guest" }, toast: {}, handleAuth: jest.fn(), refreshPremium: jest.fn() };
  useApp.mockImplementation(() => context);
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "member" }, session: { user: { id: "member" }, access_token: "fake-session" } }, error: null });
  loadDraft.mockResolvedValue(null);
  initPurchases.mockResolvedValue(undefined);
  logInPurchases.mockResolvedValue(undefined);
});
const submit = (ui) => {
  fireEvent.changeText(ui.getByPlaceholderText("app.password_min"), "test-password");
  fireEvent.changeText(ui.getByPlaceholderText("app.password_reenter"), "test-password");
  fireEvent.press(ui.getByText("app.setup_complete"));
};

test("계정 연결은 정상 handleAuth를 기다린 뒤에만 완료로 안내한다", async () => {
  let finish;
  context.handleAuth.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const ui = render(<AppNavigator />);
  submit(ui);
  await waitFor(() => expect(context.handleAuth).toHaveBeenCalledWith({ email: "member@example.test", name: "guest", _mergeExisting: true }));
  expect(Alert.alert).not.toHaveBeenCalledWith("common.done", "app.signup_complete");
  await act(async () => finish());
  expect(Alert.alert).toHaveBeenCalledWith("common.done", "app.signup_complete");
});

test("연결 저장 실패는 완료 안내 없이 배너의 실패 처리로 전달된다", async () => {
  context.handleAuth.mockRejectedValue(new Error("disk full"));
  const ui = render(<AppNavigator />);
  submit(ui);
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("common.error", "app.link_error"));
  expect(Alert.alert).not.toHaveBeenCalledWith("common.done", "app.signup_complete");
});

test("A 초안의 늦은 읽기 결과를 B 노트 작성 화면에 넣지 않는다", async () => {
  let finishA;
  context.userProfile = { authUserId: "A" };
  loadDraft.mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve; }));
  const ui = render(<AppNavigator />);
  context = { ...context, authState: "auth", storageReady: false, userProfile: {} };
  ui.rerender(<AppNavigator />);
  context = { ...context, authState: "app", storageReady: true, userProfile: { authUserId: "B" } };
  ui.rerender(<AppNavigator />);
  await act(async () => finishA({ title: "A private draft", content: "private" }));
  expect(mockNavigate).not.toHaveBeenCalled();
});


test("이메일 확인 전 user만 반환되면 계정 연결/완료 안내를 실행하지 않는다", async () => {
  supabase.auth.signUp.mockResolvedValueOnce({ data: { user: { id: "pending" }, session: null }, error: null });
  const ui = render(<AppNavigator />);
  submit(ui);
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("common.error", "app.link_error"));
  expect(context.handleAuth).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalledWith("common.done", "app.signup_complete");
});


test("RevenueCat 계정 연결이 완료된 뒤 프리미엄을 다시 확인한다", async () => {
  let finishLogin;
  context.userProfile = { authUserId: "A" };
  logInPurchases.mockImplementationOnce(() => new Promise((resolve) => { finishLogin = resolve; }));
  render(<AppNavigator />);
  await waitFor(() => expect(logInPurchases).toHaveBeenCalledWith("A"));
  expect(context.refreshPremium).not.toHaveBeenCalled();
  await act(async () => finishLogin());
  expect(context.refreshPremium).toHaveBeenCalledTimes(1);
});

test("A의 늦은 RevenueCat 연결 결과는 B 로그인 뒤 A 갱신을 실행하지 않는다", async () => {
  let finishA;
  const refreshA = jest.fn(), refreshB = jest.fn();
  context = { ...context, userProfile: { authUserId: "A" }, refreshPremium: refreshA };
  logInPurchases.mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve; }));
  const ui = render(<AppNavigator />);
  await waitFor(() => expect(logInPurchases).toHaveBeenCalledWith("A"));
  context = { ...context, userProfile: { authUserId: "B" }, refreshPremium: refreshB };
  ui.rerender(<AppNavigator />);
  await waitFor(() => expect(refreshB).toHaveBeenCalledTimes(1));
  await act(async () => finishA());
  expect(refreshA).not.toHaveBeenCalled();
  expect(refreshB).toHaveBeenCalledTimes(1);
});

test("초기 ACT RAW 링크의 sceneId를 별도 작성 화면에 전달하고 기존 source 이벤트를 유지한다", async () => {
  ExpoLinking.getInitialURL.mockResolvedValueOnce("artlink://practice?source=actraw&sceneId=actraw%3Ahamlet-tobe");
  ExpoLinking.parse.mockReturnValue({ hostname: "practice", queryParams: { title: "햄릿", content: "대사", field: "acting", source: "actraw", sceneId: "actraw:hamlet-tobe" } });
  render(<AppNavigator />);
  await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({ type: "PUSH", payload: {
    name: "NoteCreate", params: { prefill: { title: "햄릿", content: "대사", field: "acting", sceneId: "actraw:hamlet-tobe" }, restoredDraft: false },
  } }));
  expect(trackFunnelEvent).toHaveBeenCalledWith("deeplink_actraw");
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("앱 실행 중 m 링크도 새 route로 열어 쓰던 글에 새 장면 ID를 덮어쓰지 않는다", async () => {
  render(<AppNavigator />);
  const onLink = Linking.addEventListener.mock.calls.find(([event]) => event === "url")[1];
  ExpoLinking.parse.mockReturnValue({ hostname: "practice", queryParams: { title: "니나", source: "actraw", m: "seagull-nina" } });
  await act(async () => onLink({ url: "artlink://practice?source=actraw&m=seagull-nina" }));
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "PUSH", payload: expect.objectContaining({
    params: { prefill: { title: "니나", content: "", field: "acting", sceneId: "actraw:seagull-nina" }, restoredDraft: false },
  }) }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("장면 정보가 없던 bium 링크는 제목/본문과 기존 source를 그대로 전달한다", async () => {
  ExpoLinking.getInitialURL.mockResolvedValueOnce("artlink://practice?source=bium");
  ExpoLinking.parse.mockReturnValue({ hostname: "practice", queryParams: { title: "기존 제목", content: "기존 내용", field: "music", source: "bium" } });
  render(<AppNavigator />);
  await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  expect(mockDispatch.mock.calls[0][0].payload.params.prefill).toEqual({ title: "기존 제목", content: "기존 내용", field: "music" });
  expect(trackFunnelEvent).toHaveBeenCalledWith("deeplink_bium");
});
