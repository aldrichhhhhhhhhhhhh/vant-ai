-- VANT CoWork M.A.A. custom agent profiles.
-- Apply this migration before enabling profile persistence in a deployed environment.
create table if not exists public.cowork_agent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  role_key text not null default 'custom' check (
    role_key in ('planner','data_analyst','challenger','researcher','connector','integrator','mote','custom')
  ),
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cowork_agent_profiles_user_updated_idx
  on public.cowork_agent_profiles (user_id, updated_at desc);

alter table public.cowork_agent_profiles enable row level security;

revoke all on table public.cowork_agent_profiles from anon;
grant select, insert, update, delete on table public.cowork_agent_profiles to authenticated;

drop policy if exists cowork_agent_profiles_select_own on public.cowork_agent_profiles;
create policy cowork_agent_profiles_select_own
  on public.cowork_agent_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists cowork_agent_profiles_insert_own on public.cowork_agent_profiles;
create policy cowork_agent_profiles_insert_own
  on public.cowork_agent_profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists cowork_agent_profiles_update_own on public.cowork_agent_profiles;
create policy cowork_agent_profiles_update_own
  on public.cowork_agent_profiles for update to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  )
  with check (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

drop policy if exists cowork_agent_profiles_delete_own on public.cowork_agent_profiles;
create policy cowork_agent_profiles_delete_own
  on public.cowork_agent_profiles for delete to authenticated
  using (
    user_id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

create or replace function public.touch_cowork_agent_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_cowork_agent_profiles_updated_at on public.cowork_agent_profiles;
create trigger touch_cowork_agent_profiles_updated_at
before update on public.cowork_agent_profiles
for each row execute function public.touch_cowork_agent_profiles_updated_at();
