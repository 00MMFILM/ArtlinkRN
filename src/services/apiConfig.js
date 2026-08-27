/**
 * 중앙 API 설정 — 서버 URL + 보안 헤더
 *
 * 모든 서버 API 호출에서 이 모듈의 헤더를 사용합니다.
 * APP_TOKEN은 서버의 APP_SECRET 환경변수와 일치해야 합니다.
 */

export const SERVER_URL = "https://artlink-server.vercel.app";
export const MATCHING_SERVER_URL = "https://server-00mmfilms-projects.vercel.app";

import { getAuthToken } from "./supabaseClient";

const APP_TOKEN = "artlink_2026_s3cure_t0ken_xK9mP2vL";

// 게스트(비로그인) 식별용 deviceId 동기 캐시. 서버가 X-Device-Id로 게스트 체험 1회를 판정한다.
// AppContext가 앱 시작 시 deviceId를 확정하면 setApiDeviceId로 넣어준다.
let _deviceId = null;
export function setApiDeviceId(id) {
  if (id) _deviceId = id;
}

// 학습자산 동의 상태 동기 캐시. AppContext가 동의 값이 바뀔 때마다 setDataConsentCache로 갱신한다.
let _dataConsent = false;
export function setDataConsentCache(value) {
  _dataConsent = !!value;
}

/**
 * API 요청용 공통 헤더 반환
 * Content-Type + X-App-Token
 *  + 로그인 시 Authorization: Bearer <supabase token> (프리미엄/쿼터 식별)
 *  + 비로그인 시 X-Device-Id (게스트 체험 1회 판정)
 *  + 동의 시 X-Data-Consent: 1 (학습자산 활용 동의 여부)
 */
export function getApiHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-App-Token": APP_TOKEN,
  };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else if (_deviceId) headers["X-Device-Id"] = _deviceId;
  if (_dataConsent) headers["X-Data-Consent"] = "1";
  return headers;
}
