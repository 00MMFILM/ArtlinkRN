-- Artlink Community Tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. users: device-based users
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  device_id text unique not null,
  display_name text not null default '익명',
  field text,
  created_at timestamptz default now()
);

-- 2. community_posts
create table public.community_posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  author_name text not null,
  author_field text,
  type text not null default '팁 공유',
  title text not null,
  content text not null,
  likes_count int default 0,
  comments_count int default 0,
  created_at timestamptz default now()
);

-- 3. community_comments
create table public.community_comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  author_name text not null,
  author_field text,
  content text not null,
  created_at timestamptz default now()
);

-- 4. community_likes (one per user per post)
create table public.community_likes (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

-- 5. Indexes
create index idx_posts_created on community_posts(created_at desc);
create index idx_comments_post on community_comments(post_id);
create index idx_likes_user_post on community_likes(user_id, post_id);

-- 6. Auto-update likes_count trigger
create or replace function update_likes_count() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set likes_count = likes_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set likes_count = likes_count - 1 where id = OLD.post_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_like_change after insert or delete on community_likes
  for each row execute function update_likes_count();

-- 7. Auto-update comments_count trigger
create or replace function update_comments_count() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set comments_count = comments_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set comments_count = comments_count - 1 where id = OLD.post_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_comment_change after insert or delete on community_comments
  for each row execute function update_comments_count();

-- 8. RLS policies (MVP: open read/write, tighten later)
alter table users enable row level security;
alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_likes enable row level security;

create policy "read all" on users for select using (true);
create policy "insert" on users for insert with check (true);

create policy "read all" on community_posts for select using (true);
create policy "insert" on community_posts for insert with check (true);

create policy "read all" on community_comments for select using (true);
create policy "insert" on community_comments for insert with check (true);

create policy "read all" on community_likes for select using (true);
create policy "insert" on community_likes for insert with check (true);
create policy "delete own" on community_likes for delete using (true);
