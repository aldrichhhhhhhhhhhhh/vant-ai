-- VANT Phase 04A: Project Knowledge foundation
-- Additive only. Do not rewrite historical Project/Collaboration migrations.

create table if not exists public.project_knowledge (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  content text not null default '',
  knowledge_type text not null default 'note',
  source_type text not null default 'manual',
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_knowledge_type_check
    check (knowledge_type in ('fact','goal','decision','note','instruction','reference')),

  constraint project_knowledge_source_check
    check (source_type in ('manual','chat','activity','file','vant'))
);

create index if not exists project_knowledge_project_idx
  on public.project_knowledge (project_id);

create index if not exists project_knowledge_project_type_idx
  on public.project_knowledge (project_id, knowledge_type);

create index if not exists project_knowledge_project_updated_idx
  on public.project_knowledge (project_id, updated_at desc);

alter table public.project_knowledge enable row level security;

drop policy if exists "project_knowledge_select" on public.project_knowledge;
create policy "project_knowledge_select"
  on public.project_knowledge
  for select
  using (public.is_project_member(project_id));

drop policy if exists "project_knowledge_insert" on public.project_knowledge;
create policy "project_knowledge_insert"
  on public.project_knowledge
  for insert
  with check (
    public.is_project_member(project_id)
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('owner', 'collaborator')
    )
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "project_knowledge_update" on public.project_knowledge;
create policy "project_knowledge_update"
  on public.project_knowledge
  for update
  using (
    public.is_project_member(project_id)
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('owner', 'collaborator')
    )
  )
  with check (
    public.is_project_member(project_id)
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('owner', 'collaborator')
    )
  );

drop policy if exists "project_knowledge_delete" on public.project_knowledge;
create policy "project_knowledge_delete"
  on public.project_knowledge
  for delete
  using (
    public.is_project_member(project_id)
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('owner', 'collaborator')
    )
  );

create or replace function public.touch_project_knowledge_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists project_knowledge_updated_at on public.project_knowledge;
create trigger project_knowledge_updated_at
  before update on public.project_knowledge
  for each row
  execute function public.touch_project_knowledge_updated_at();

revoke all on function public.touch_project_knowledge_updated_at() from public;
