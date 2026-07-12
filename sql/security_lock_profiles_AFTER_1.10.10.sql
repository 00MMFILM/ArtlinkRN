-- ⚠️ 1.10.10 배포·충분히 확산된 뒤에 실행할 것! ⚠️
-- (지금 실행하면 아직 1.10.9 쓰는 사용자의 프로필 기능이 깨짐)
--
-- 1.10.10부터 앱은 프로필을 anon 직접이 아니라 서버(service_role) 경유로만 접근함.
-- 이 SQL로 anon/authenticated의 artist_profiles·users 직접 접근을 전면 차단하면
-- 이메일 유출·프로필 변조·device_id 노출이 완전히 봉쇄됨.
-- service_role(서버)은 grant를 우회하므로 서버 엔드포인트는 정상 동작.

-- artist_profiles: 앱은 이제 서버 경유로만 읽고/쓴다 → anon 전면 차단
revoke select, insert, update, delete on public.artist_profiles from anon, authenticated;

-- users: 등록/조회를 서버로 이전 → anon 전면 차단 (device_id 노출·계정 변조 차단)
revoke select, insert, update, delete on public.users from anon, authenticated;

-- (선택) 확인용: 위 실행 후 anon 키로 아래가 401/403이면 성공
--   GET  /rest/v1/artist_profiles?select=email
--   GET  /rest/v1/users?select=device_id
