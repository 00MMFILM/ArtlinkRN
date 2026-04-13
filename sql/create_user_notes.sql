-- user_notes: 노트 서버 동기화용 테이블
-- Supabase SQL Editor에서 실행

CREATE TABLE user_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID NOT NULL,
  local_id BIGINT NOT NULL,          -- 앱의 Date.now() ID
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  field TEXT,
  tags TEXT[],
  series_name TEXT,
  starred BOOLEAN DEFAULT false,
  ai_comment TEXT,
  ai_scores JSONB,
  video_analysis TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT false,      -- soft delete for sync
  UNIQUE(auth_user_id, local_id)
);

-- RLS: 본인 노트만 접근
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notes" ON user_notes FOR ALL USING (auth.uid() = auth_user_id);

CREATE INDEX idx_user_notes_auth ON user_notes(auth_user_id);
