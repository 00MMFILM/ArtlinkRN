-- 보안 응급조치 (2026-07-05)
-- anon 키(앱에 내장 = 공개)로 "전 사용자/데이터 삭제"가 가능하던 문제 차단.
-- REVOKE DELETE만 사용 → SELECT/INSERT/UPDATE는 그대로라 앱 기능 안 깨짐.
-- service_role(서버)은 grant를 우회하므로 서버 작업엔 영향 없음.
-- 한 줄씩 독립 명령 (붙여넣기 잘림 방지).
--
-- 제외: proposals, artist_profiles, community_posts, community_likes
-- (앱이 anon으로 정상 삭제하는 테이블) — 다음 릴리스에서 서버 경유로 근본 해결.

revoke delete on public.users from anon, authenticated;
revoke delete on public.mau_tracking from anon, authenticated;
revoke delete on public.funnel_events from anon, authenticated;
revoke delete on public.training_data from anon, authenticated;
revoke delete on public.raw_training_content from anon, authenticated;
revoke delete on public.postings from anon, authenticated;
revoke delete on public.crawl_logs from anon, authenticated;
revoke delete on public.anonymous_ai_metadata from anon, authenticated;
revoke delete on public.reports from anon, authenticated;
revoke delete on public.growth_vectors from anon, authenticated;
revoke delete on public.proposal_replies from anon, authenticated;
revoke delete on public.community_comments from anon, authenticated;
