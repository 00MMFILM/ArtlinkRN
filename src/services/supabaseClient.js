import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SUPABASE_URL = "https://ayvfdomoghppgrleugnk.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dmZkb21vZ2hwcGdybGV1Z25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTM4NjksImV4cCI6MjA4NzU4OTg2OX0.2F4Ra531WJZv8jGvD51V7dOf1yOmFdxaD09V7fJjkd0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// 로그인 유저의 액세스 토큰을 동기적으로 읽기 위한 캐시.
// 서버 AI/쿼터 API는 Authorization: Bearer <access token>으로 유저를 식별하는데,
// getApiHeaders()가 동기 함수라 매 호출마다 await 할 수 없어 여기에 캐시한다.
// 초기 세션 + 갱신(TOKEN_REFRESHED)·로그인·로그아웃을 onAuthStateChange가 모두 커버.
let _accessToken = null;
supabase.auth.getSession().then(({ data }) => {
  _accessToken = data?.session?.access_token || null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  _accessToken = session?.access_token || null;
});

/** 현재 로그인 유저의 Supabase 액세스 토큰 (비로그인/게스트면 null) */
export function getAuthToken() {
  return _accessToken;
}
