-- dataCollectionService.submitAnonymousMetadata()가 insert하는 테이블인데 존재하지 않았음.
-- (AI 분석 후 익명 메타데이터 전송이 조용히 계속 실패 중이었음)
create table if not exists public.anonymous_ai_metadata (
  id bigint generated always as identity primary key,
  device_id text,
  field text,
  note_title_hash text,
  feedback_length integer,
  feedback_sections text,
  tags jsonb default '[]'::jsonb,
  user_type text,
  created_at timestamptz default now()
);

alter table public.anonymous_ai_metadata enable row level security;
