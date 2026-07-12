-- training-generate 엔드포인트가 upsert(onConflict: content_hash)를 쓰는데
-- training_data 테이블에 content_hash unique 제약이 없어서 2주간 저장 실패했음.
-- 이 SQL로 중복 제거 후 제약을 추가하면 네이버→AI가공 파이프라인이 복구됨.

-- 1. 중복 content_hash 제거 (최신 행만 유지)
DELETE FROM public.training_data a
USING public.training_data b
WHERE a.content_hash = b.content_hash
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

-- 2. upsert가 참조하는 unique 제약 추가
ALTER TABLE public.training_data
  ADD CONSTRAINT training_data_content_hash_key UNIQUE (content_hash);
