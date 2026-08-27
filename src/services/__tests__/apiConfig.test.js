// supabase 클라이언트는 이 테스트에서 쓰지 않으므로 mock (env/네트워크 의존 제거)
jest.mock("../supabaseClient", () => ({ getAuthToken: () => null }));

import { getApiHeaders, setDataConsentCache } from "../apiConfig";

describe("getApiHeaders — X-Data-Consent", () => {
  afterEach(() => {
    setDataConsentCache(false); // 테스트 간 캐시 격리
  });

  it("동의 캐시가 true면 X-Data-Consent: 1 헤더를 포함한다", () => {
    setDataConsentCache(true);
    const headers = getApiHeaders();
    expect(headers["X-Data-Consent"]).toBe("1");
  });

  it("동의 캐시가 false면 X-Data-Consent 헤더를 생략한다", () => {
    setDataConsentCache(false);
    const headers = getApiHeaders();
    expect(headers["X-Data-Consent"]).toBeUndefined();
  });
});
