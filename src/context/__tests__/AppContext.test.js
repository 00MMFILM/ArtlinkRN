// 게스트 재진입 — 둘러보기를 한 번 누른 기기는 다음 실행부터 바로 홈으로,
// 로그아웃한 사용자는 다시 가입 화면을 본다 (앱 시작 진입 판정만 순수 함수로 분리해 검증).
jest.mock("react-native", () => ({ AppState: { addEventListener: jest.fn() }, Platform: { OS: "ios" } }));
jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn() }));
jest.mock("../../services/supabaseClient", () => ({ supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })) } } }));
jest.mock("i18next", () => ({ language: "ko", t: (k) => k }));
jest.mock("../../services/analyticsService", () => ({ computeArtistProfile: jest.fn(() => ({})) }));
jest.mock("../../services/communityService", () => ({ ensureDeviceUser: jest.fn() }));
jest.mock("../../services/profileService", () => ({ upsertArtistProfile: jest.fn(), deleteArtistProfile: jest.fn(), uploadProfilePhotos: jest.fn(), mergeServerStats: jest.fn((a) => a) }));
jest.mock("../../services/notesSyncService", () => ({ syncSingleNote: jest.fn(), syncNotesToServer: jest.fn(), fetchNotesFromServer: jest.fn(), mergeNotes: jest.fn(), deleteNoteFromServer: jest.fn() }));
jest.mock("../../services/mauService", () => ({ trackAppOpen: jest.fn(), trackFunnelEvent: jest.fn() }));
jest.mock("../../services/matchingService", () => ({ createMatchingPost: jest.fn(), deleteMatchingPost: jest.fn() }));
jest.mock("../../services/apiConfig", () => ({ SERVER_URL: "https://server.test", getApiHeaders: () => ({}), setApiDeviceId: jest.fn(), setDataConsentCache: jest.fn() }));
jest.mock("../../services/premiumService", () => ({ fetchPremiumStatus: jest.fn(), EMPTY_PREMIUM: {}, shouldApplyServerPremium: jest.fn(), PREMIUM_OPTIMISTIC_MS: 1000 }));
jest.mock("../../services/practiceService", () => ({ getPracticeLog: jest.fn(async () => []) }));
jest.mock("../../utils/storage", () => ({ safeStorageGet: jest.fn(), safeStorageSet: jest.fn(), STORAGE_KEYS: {} }));

const { resolveInitialAuthState, GUEST_ENTERED_KEY } = require("../AppContext");

describe("resolveInitialAuthState — 앱 시작 진입 판정", () => {
  it("저장 키 이름은 고정 (기존 기기의 값을 읽어야 한다)", () => {
    expect(GUEST_ENTERED_KEY).toBe("artlink-guest-entered");
  });

  it("프로필이 없어도 둘러보기 이력이 있으면 바로 앱으로", () => {
    expect(resolveInitialAuthState({ profile: null, hasSession: false, guestEntered: true })).toBe("app");
  });

  it("프로필도 둘러보기 이력도 없으면 가입 화면 (로그아웃 직후 포함)", () => {
    expect(resolveInitialAuthState({ profile: null, hasSession: false, guestEntered: false })).toBe("auth");
  });

  it("auth 연동 프로필은 세션이 있어야 진입 — 둘러보기 이력과 무관", () => {
    expect(resolveInitialAuthState({ profile: { authUserId: "u1" }, hasSession: true, guestEntered: false })).toBe("app");
    expect(resolveInitialAuthState({ profile: { authUserId: "u1" }, hasSession: false, guestEntered: true })).toBe("auth");
  });

  it("auth 미연동 기존 유저는 기존대로 바로 진입", () => {
    expect(resolveInitialAuthState({ profile: { name: "기존" }, hasSession: false, guestEntered: false })).toBe("app");
  });
});
