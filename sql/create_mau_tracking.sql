-- MAU 추적 테이블 (server/api/track-mau.js가 upsert하는 대상)
-- onConflict: "device_id,month" 를 위해 unique 제약 필수
create table if not exists public.mau_tracking (
  id bigint generated always as identity primary key,
  device_id text not null,
  month text not null,
  language text,
  user_type text,
  platform text,
  app_version text,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  unique (device_id, month)
);

-- RLS 활성화: anon 정책을 만들지 않으므로 클라이언트 직접 접근은 차단되고,
-- 서버(service_role 키)만 읽기/쓰기 가능
alter table public.mau_tracking enable row level security;
