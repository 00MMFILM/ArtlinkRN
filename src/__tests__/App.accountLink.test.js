import React from "react";
import { Alert, Linking } from "react-native";
import { act, render, fireEvent, waitFor } from "@testing-library/react-native";
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }) => children,
  createNavigationContainerRef: () => ({ isReady: () => true, getRootState: () => ({ routeNames: ["NoteCreate"] }), navigate: mockNavigate }),
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
let context;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "addEventListener").mockReturnValue({ remove: jest.fn() });
  context = { authState: "app", storageReady: true, eulaAccepted: true, userProfile: { email: "member@example.test", name: "guest" }, toast: {}, handleAuth: jest.fn() };
  useApp.mockImplementation(() => context);
  supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "member" }, session: { user: { id: "member" }, access_token: "fake-session" } }, error: null });
  loadDraft.mockResolvedValue(null);
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
