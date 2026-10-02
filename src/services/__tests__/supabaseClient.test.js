// 1.11.9 — 백그라운드에서 돌아오면 토큰 갱신을 다시 켠다 (만료 토큰으로 게스트 취급되던 문제)
const mockAuth = {
  getSession: jest.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
let mockAppStateHandler;
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ auth: mockAuth })) }));
jest.mock("@react-native-async-storage/async-storage", () => ({}));
jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn((_type, handler) => { mockAppStateHandler = handler; }) },
}));

test("앱이 화면에 돌아오면 갱신을 켜고, 내려가면 끈다", () => {
  const { getAuthToken } = require("../supabaseClient");
  mockAppStateHandler("background");
  expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  mockAppStateHandler("active");
  expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1);

  // 갱신된 토큰은 onAuthStateChange로 들어와 다음 요청부터 쓰인다
  mockAuth.onAuthStateChange.mock.calls[0][0]("TOKEN_REFRESHED", { access_token: "fresh" });
  expect(getAuthToken()).toBe("fresh");
});
