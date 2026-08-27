-- 긴급 (2026-08-13): training_data가 anon 키로 전체 SELECT 가능 — 유저 노트 원문 노출.
-- 앱(dataCollectionService)의 중복확인은 select("id").eq("content_hash")만 사용하므로
-- 그 두 컬럼만 남기고 내용 컬럼 읽기를 차단한다. 앱 수정·업데이트 불필요.
-- 크론 training-generate는 service key라 영향 없음.

REVOKE SELECT ON public.training_data FROM anon, authenticated;
GRANT SELECT (id, content_hash) ON public.training_data TO anon, authenticated;

-- 검증 1 (차단 확인 — 에러가 나야 정상):
--   anon으로 REST 호출: /rest/v1/training_data?select=note_content&limit=1 → 42501 에러
-- 검증 2 (앱 동작 확인 — 성공해야 정상):
--   /rest/v1/training_data?select=id&content_hash=eq.test → 200 []
