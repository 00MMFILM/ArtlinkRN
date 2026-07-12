-- 온보딩 퍼널 이벤트 테이블 (server/api/track-event.js가 기록)
-- 기기당 이벤트별 최초 1회만 저장 → 퍼널 전환율 계산용
create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  device_id text not null,
  event text not null,
  platform text,
  app_version text,
  language text,
  created_at timestamptz default now(),
  unique (device_id, event)
);

-- RLS 활성화: anon 정책 없음 → 서버(service_role)만 접근 가능
alter table public.funnel_events enable row level security;
