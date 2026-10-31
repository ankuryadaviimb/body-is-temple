-- Temple: coach (M3). Memory notes with version history, coach questions and answers,
-- and AI morning cards. Row-level security restricts every row to its owner.

-- Memory: a few short notes the coach reads before every answer (editable in the app).
create table if not exists public.memory_files (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null check (slug in ('profile', 'gut', 'fitness', 'foods', 'experiments', 'questions', 'notes')),
  content text not null default '' check (char_length(content) <= 4000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);

-- Every saved version of a memory note, so nothing the coach relies on is ever lost.
create table if not exists public.memory_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  version integer not null,
  content text not null check (char_length(content) <= 4000),
  source text not null check (source in ('seed', 'user', 'remember')),
  created_at timestamptz not null default now()
);
create index if not exists memory_versions_user on public.memory_versions (user_id, slug, version desc);

-- Coach questions and answers (the instant rule answer and the AI answer).
create table if not exists public.coach_messages (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  logical_day date not null,
  intent text not null check (intent in ('should_go', 'gas', 'morning', 'heavy', 'ate_right', 'dinner', 'free')),
  question text not null check (char_length(question) between 1 and 600),
  quick jsonb,
  answer jsonb,
  status text not null default 'done' check (status in ('done', 'failed', 'rules_only')),
  provider text,
  created_at timestamptz not null default now(),
  constraint coach_answer_size check (pg_column_size(answer) < 16384 and pg_column_size(quick) < 16384)
);
create index if not exists coach_messages_user on public.coach_messages (user_id, created_at desc);

-- AI morning cards, one per logical day. A 'pending' row doubles as a lock so a card
-- is generated once, even when several requests arrive together.
create table if not exists public.coach_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  logical_day date not null,
  kind text not null default 'morning' check (kind in ('morning')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  content jsonb,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, logical_day, kind),
  constraint coach_card_size check (pg_column_size(content) < 8192)
);

alter table public.memory_files enable row level security;
alter table public.memory_versions enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_cards enable row level security;

create policy memory_files_owner on public.memory_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- History is append-only from the app: it can be read and added to, never edited.
create policy memory_versions_read on public.memory_versions
  for select using (auth.uid() = user_id);
create policy memory_versions_insert on public.memory_versions
  for insert with check (auth.uid() = user_id);
create policy coach_messages_owner on public.coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy coach_cards_owner on public.coach_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger coach_cards_touch before update on public.coach_cards
  for each row execute function public.touch_updated_at();

-- Saves a memory note and its version in one step (runs as the caller, under RLS).
create or replace function public.save_memory(p_slug text, p_content text, p_source text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v integer;
begin
  insert into public.memory_files (user_id, slug, content, version)
  values (auth.uid(), p_slug, p_content, 1)
  on conflict (user_id, slug) do update
    set content = excluded.content,
        version = public.memory_files.version + 1,
        updated_at = now()
  returning version into v;
  insert into public.memory_versions (user_id, slug, version, content, source)
  values (auth.uid(), p_slug, v, p_content, p_source);
  return v;
end;
$$;

-- Only signed-in users may call it (anonymous callers have no user id anyway).
revoke execute on function public.save_memory(text, text, text) from public, anon;
grant execute on function public.save_memory(text, text, text) to authenticated;
