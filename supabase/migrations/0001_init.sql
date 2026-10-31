-- Temple: initial schema (M1).
-- Every row belongs to one user. Row-level security restricts all access to the owner.
-- The app server talks to the database as the signed-in user, so these policies apply
-- to every query it makes.

-- Settings: one JSON document per user (validated by the app before saving).
create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Events: every log (meal, toilet visit, water, sleep, workout, and so on).
create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'wake', 'sleep', 'water', 'drink', 'isabgol', 'meal', 'toilet', 'practice', 'sensation',
    'gas', 'walk', 'workout', 'weigh_in', 'mood', 'stress', 'intimacy', 'late_work', 'symptom', 'note'
  )),
  occurred_at timestamptz not null,
  logical_day date not null,
  source text not null default 'app' check (source in ('app', 'shortcut', 'health', 'inferred')),
  payload jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payload_size check (pg_column_size(payload) < 8192),
  constraint meta_size check (pg_column_size(meta) < 16384)
);
create index if not exists events_user_day on public.events (user_id, logical_day) where deleted_at is null;
create index if not exists events_user_time on public.events (user_id, occurred_at) where deleted_at is null;

-- Media: photos and report files. The bytes live in the private "media" storage bucket.
create table if not exists public.media (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('meal_photo', 'stool_photo', 'report')),
  path text not null,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes integer not null check (bytes > 0 and bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index if not exists media_user on public.media (user_id, created_at);

-- AI usage counters, so every provider stays inside its free daily allowance.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  provider text not null check (provider in ('cloudflare', 'groq', 'gemini')),
  requests integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  primary key (user_id, day, provider)
);

alter table public.settings enable row level security;
alter table public.events enable row level security;
alter table public.media enable row level security;
alter table public.ai_usage enable row level security;

create policy settings_owner on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy events_owner on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy media_owner on public.media
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ai_usage_owner on public.ai_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- Atomic AI usage increment that returns the new request count (runs as the caller).
create or replace function public.bump_ai_usage(p_day date, p_provider text, p_in integer, p_out integer)
returns integer
language sql
set search_path = ''
as $$
  insert into public.ai_usage (user_id, day, provider, requests, input_tokens, output_tokens)
  values (auth.uid(), p_day, p_provider, 1, greatest(p_in, 0), greatest(p_out, 0))
  on conflict (user_id, day, provider) do update
    set requests = public.ai_usage.requests + 1,
        input_tokens = public.ai_usage.input_tokens + greatest(excluded.input_tokens, 0),
        output_tokens = public.ai_usage.output_tokens + greatest(excluded.output_tokens, 0)
  returning requests;
$$;

-- Private storage bucket for photos and reports. Files are stored under "<user id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy media_objects_read on storage.objects
  for select using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_objects_insert on storage.objects
  for insert with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_objects_delete on storage.objects
  for delete using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
