/**
 * 중앙 API 설정 — 서버 URL + 보안 헤더
 *
 * 모든 서버 API 호출에서 이 모듈의 헤더를 사용합니다.
 * APP_TOKEN은 서버의 APP_SECRET 환경변수와 일치해야 합니다.
 */

export const SERVER_URL = "https://artlink-server.vercel.app";
export const MATCHING_SERVER_URL = "https://server-00mmfilms-projects.vercel.app";

const APP_TOKEN = "artlink_2026_s3cure_t0ken_xK9mP2vL";

/**
 * API 요청용 공통 헤더 반환
 * Content-Type + X-App-Token 포함
 */
export function getApiHeaders() {
  return {
    "Content-Type": "application/json",
    "X-App-Token": APP_TOKEN,
  };
}
