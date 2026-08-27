-- 대표 지정 평생 무료(comp) 등록: 이찬중, 이주혜 (2026-08-13)
-- 실행: Supabase 대시보드 SQL Editor

-- 1) 먼저 가입 여부 확인 (이 결과를 보고 아래 INSERT 실행)
SELECT id, email, raw_user_meta_data->>'name' AS name, created_at
FROM auth.users
WHERE raw_user_meta_data->>'name' IN ('이찬중', '이주혜')
   OR raw_user_meta_data->>'full_name' IN ('이찬중', '이주혜');

-- 2) 위에서 나온 사람을 평생 무료로 등록 (재실행해도 안전 — upsert)
INSERT INTO public.premium_members (user_id, kind, note, active)
SELECT id, 'comp',
       '대표 지정 평생무료 ' || COALESCE(raw_user_meta_data->>'name', email) || ' 2026-08-13',
       true
FROM auth.users
WHERE raw_user_meta_data->>'name' IN ('이찬중', '이주혜')
   OR raw_user_meta_data->>'full_name' IN ('이찬중', '이주혜')
ON CONFLICT (user_id) DO UPDATE
  SET kind = 'comp', active = true, note = EXCLUDED.note;

-- 3) 등록 결과 확인
SELECT user_id, kind, note, active FROM public.premium_members WHERE kind = 'comp';
