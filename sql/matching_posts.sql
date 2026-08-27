-- matching_posts: 사용자가 앱에서 작성한 매칭 공고(프로젝트/오디션/콜라보) 서버 저장용 테이블
--
-- ⚠️ 이 마이그레이션을 Supabase에 적용해야 서버 저장이 실제로 작동한다.
--    (적용 전까지 앱은 공고를 로컬 AsyncStorage에만 저장하고, 서버 저장은 조용히 실패한다.
--     즉 다른 사용자에게는 공고가 보이지 않는다.)
--    적용 방법: Supabase Dashboard > SQL Editor > New Query 에 붙여넣고 실행.
--
-- 컬럼 명명은 작성화면(MatchingPostCreateScreen)이 넘기는 키를 정본으로 한다 → requirements(JSONB).

CREATE TABLE public.matching_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,  -- 기기 기반 유저 (익명 허용 → NULL 가능)
  auth_user_id UUID,                    -- Supabase Auth 유저 (로그인 사용자만, 수정·삭제 권한 판정용)
  local_id BIGINT,                      -- 앱 로컬 id (Date.now()) — 로컬/서버 항목 대조용
  author_name TEXT,
  author_field TEXT,
  tab TEXT NOT NULL DEFAULT '프로젝트',  -- 프로젝트 | 오디션 | 콜라보
  title TEXT NOT NULL,
  field TEXT,
  description TEXT NOT NULL DEFAULT '',
  deadline TEXT,                        -- 자유 입력 문자열이라 DATE 아닌 TEXT
  tags TEXT[] DEFAULT '{}',
  contact TEXT,
  requirements JSONB,                   -- { gender, ageRange:[n,n], heightRange:[n,n], specialties:[], location }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matching_posts_created ON public.matching_posts(created_at DESC);
CREATE INDEX idx_matching_posts_auth ON public.matching_posts(auth_user_id);

-- RLS: 읽기는 전체 공개(커뮤니티 테이블과 동일 수준), 수정·삭제는 작성자 본인만
ALTER TABLE public.matching_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read all" ON public.matching_posts
  FOR SELECT USING (true);

-- 남의 auth_user_id를 사칭해 쓰는 것만 차단 (익명 작성은 NULL로 허용)
CREATE POLICY "insert own" ON public.matching_posts
  FOR INSERT WITH CHECK (auth_user_id IS NULL OR auth_user_id = auth.uid());

CREATE POLICY "update own" ON public.matching_posts
  FOR UPDATE USING (auth_user_id IS NOT NULL AND auth_user_id = auth.uid());

CREATE POLICY "delete own" ON public.matching_posts
  FOR DELETE USING (auth_user_id IS NOT NULL AND auth_user_id = auth.uid());
