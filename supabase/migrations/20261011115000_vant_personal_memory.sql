create table if not exists public.vant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  content text not null default '' check (char_length(content) <= 4000),
  memory_type text not null default 'fact' check (memory_type in ('fact','preference','goal','project','instruction','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vant_memories_user_updated_idx
  on public.vant_memories (user_id, updated_at desc);

alter table public.vant_memories enable row level security;

drop policy if exists vant_memories_select_own on public.vant_memories;
create policy vant_memories_select_own on public.vant_memories
  for select to authenticated using (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');

drop policy if exists vant_memories_insert_own on public.vant_memories;
create policy vant_memories_insert_own on public.vant_memories
  for insert to authenticated with check (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');

drop policy if exists vant_memories_update_own on public.vant_memories;
create policy vant_memories_update_own on public.vant_memories
  for update to authenticated using (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true') with check (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');

drop policy if exists vant_memories_delete_own on public.vant_memories;
create policy vant_memories_delete_own on public.vant_memories
  for delete to authenticated using (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');

create or replace function public.touch_vant_memories_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_vant_memories_updated_at on public.vant_memories;
create trigger touch_vant_memories_updated_at
before update on public.vant_memories
for each row execute function public.touch_vant_memories_updated_at();
