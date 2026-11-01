-- Temple: health records (blood reports, consultations, prescriptions, scans).
-- The file itself lives in the private "media" bucket (media.kind = 'report'); this row
-- holds what it is, its date, and the values read from it. Owner-only, like every table.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_user_id_id_unique') then
    alter table public.media add constraint media_user_id_id_unique unique (user_id, id);
  end if;
end;
$$;

create table if not exists public.health_documents (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_id uuid not null,
  kind text not null check (kind in ('blood_report', 'consultation', 'prescription', 'scan', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  doc_date date,
  notes text check (char_length(notes) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'done', 'no_text', 'image', 'failed')),
  extraction jsonb,
  pages integer check (pages between 0 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_documents_extraction_size check (pg_column_size(extraction) < 65536),
  -- Composite key: a record can only point at a file of the same owner.
  constraint health_documents_media_fk foreign key (user_id, media_id) references public.media (user_id, id) on delete cascade
);
create index if not exists health_documents_user_date on public.health_documents (user_id, doc_date desc nulls last, created_at desc);

alter table public.health_documents enable row level security;

create policy health_documents_owner on public.health_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger health_documents_touch before update on public.health_documents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------
-- Hardening (security review, 2026-11-01).

-- The app never uses the anonymous role for data.
revoke all on all tables in schema public from anon;

-- AI counters: readable by their owner, changed only through these two functions.
drop policy if exists ai_usage_owner on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select using (auth.uid() = user_id);

create or replace function public.bump_ai_usage(p_day date, p_provider text, p_in integer, p_out integer)
returns integer
language sql
security definer
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

create or replace function public.record_ai_tokens(p_day date, p_provider text, p_in integer, p_out integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set input_tokens = input_tokens + greatest(p_in, 0),
         output_tokens = output_tokens + greatest(p_out, 0)
   where user_id = auth.uid() and day = p_day and provider = p_provider;
$$;

revoke execute on function public.bump_ai_usage(date, text, integer, integer) from public, anon;
revoke execute on function public.record_ai_tokens(date, text, integer, integer) from public, anon;
grant execute on function public.bump_ai_usage(date, text, integer, integer) to authenticated;
grant execute on function public.record_ai_tokens(date, text, integer, integer) to authenticated;

-- Old memory versions can be removed by their owner.
create policy memory_versions_delete on public.memory_versions for delete using (auth.uid() = user_id);

-- Re-places entries on their days after a time zone change (runs as the caller, under RLS).
create or replace function public.set_logical_days(p_ids uuid[], p_days date[])
returns integer
language sql
set search_path = ''
as $$
  with v as (select unnest(p_ids) as id, unnest(p_days) as day),
  u as (
    update public.events e set logical_day = v.day
      from v
     where e.id = v.id and e.user_id = auth.uid() and e.logical_day <> v.day
    returning 1
  )
  select count(*)::integer from u;
$$;
revoke execute on function public.set_logical_days(uuid[], date[]) from public, anon;
grant execute on function public.set_logical_days(uuid[], date[]) to authenticated;

-- Sign-ups are limited to allowed emails in the database itself, not only in the app.
-- Fill private.allowed_emails from the SQL editor (never commit your email):
--   insert into private.allowed_emails (email) values ('you@example.com');
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.allowed_emails (
  email text primary key check (email = lower(email))
);

create or replace function private.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Sign-ups are limited to allowed emails';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_email on auth.users;
create trigger enforce_allowed_email before insert on auth.users
  for each row execute function private.enforce_allowed_email();
