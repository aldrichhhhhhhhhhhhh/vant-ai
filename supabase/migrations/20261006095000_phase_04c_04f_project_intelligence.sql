-- VANT Phase 04C-04F: project memory, intelligence summary, and contract hardening

create table if not exists public.project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  memory_type text not null default 'fact',
  title text not null,
  content text not null default '',
  source_type text not null default 'manual',
  source_id uuid,
  confidence numeric(4,3) not null default 1.000,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_memory_type_check
    check (memory_type in ('fact','decision','goal','action_item','open_question')),
  constraint project_memory_source_check
    check (source_type in ('manual','chat','activity','file','vant')),
  constraint project_memory_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists project_memory_project_idx
  on public.project_memory (project_id);
create index if not exists project_memory_project_updated_idx
  on public.project_memory (project_id, updated_at desc);
create index if not exists project_memory_created_by_idx
  on public.project_memory (created_by);

alter table public.project_memory enable row level security;

drop policy if exists "project_memory_select" on public.project_memory;
create policy "project_memory_select" on public.project_memory
  for select using ((select public.is_project_member(project_id)));

drop policy if exists "project_memory_insert" on public.project_memory;
create policy "project_memory_insert" on public.project_memory
  for insert with check (
    (select public.is_project_member(project_id))
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = project_memory.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner','collaborator')
    )
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists "project_memory_update" on public.project_memory;
create policy "project_memory_update" on public.project_memory
  for update using (
    (select public.is_project_member(project_id))
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = project_memory.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner','collaborator')
    )
  ) with check (
    (select public.is_project_member(project_id))
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = project_memory.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner','collaborator')
    )
  );

drop policy if exists "project_memory_delete" on public.project_memory;
create policy "project_memory_delete" on public.project_memory
  for delete using (
    (select public.is_project_member(project_id))
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = project_memory.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner','collaborator')
    )
  );

create or replace function public.touch_project_memory_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists project_memory_updated_at on public.project_memory;
create trigger project_memory_updated_at
before update on public.project_memory
for each row execute function public.touch_project_memory_updated_at();

revoke all on function public.touch_project_memory_updated_at() from public;
revoke all on function public.touch_project_memory_updated_at() from anon;
revoke all on function public.touch_project_memory_updated_at() from authenticated;

create or replace function public.get_project_intelligence_summary(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_knowledge_count int;
  v_memory_count int;
  v_activity_count int;
  v_team_count int;
  v_chat_count int;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = v_uid
  ) and not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = v_uid
  ) then
    raise exception 'project_access_denied';
  end if;

  select count(*) into v_knowledge_count from public.project_knowledge where project_id=p_project_id;
  select count(*) into v_memory_count from public.project_memory where project_id=p_project_id;
  select count(*) into v_activity_count from public.project_activity where project_id=p_project_id;
  select count(*) into v_team_count from public.project_members where project_id=p_project_id;
  select count(*) into v_chat_count from public.chat_conversations where project_id=p_project_id::text;

  return jsonb_build_object(
    'knowledge_count', v_knowledge_count,
    'memory_count', v_memory_count,
    'activity_count', v_activity_count,
    'member_count', v_team_count,
    'chat_count', v_chat_count,
    'generated_at', now()
  );
end;
$function$;

revoke all on function public.get_project_intelligence_summary(uuid) from public;
revoke all on function public.get_project_intelligence_summary(uuid) from anon;
grant execute on function public.get_project_intelligence_summary(uuid) to authenticated;
