-- VANT Phase 04A performance hardening
create index if not exists project_knowledge_created_by_idx
  on public.project_knowledge (created_by);

drop policy if exists "project_knowledge_select" on public.project_knowledge;
create policy "project_knowledge_select"
  on public.project_knowledge
  for select
  using ((select public.is_project_member(project_id)));

drop policy if exists "project_knowledge_insert" on public.project_knowledge;
create policy "project_knowledge_insert"
  on public.project_knowledge
  for insert
  with check (
    (select public.is_project_member(project_id))
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner', 'collaborator')
    )
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists "project_knowledge_update" on public.project_knowledge;
create policy "project_knowledge_update"
  on public.project_knowledge
  for update
  using (
    (select public.is_project_member(project_id))
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner', 'collaborator')
    )
  )
  with check (
    (select public.is_project_member(project_id))
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner', 'collaborator')
    )
  );

drop policy if exists "project_knowledge_delete" on public.project_knowledge;
create policy "project_knowledge_delete"
  on public.project_knowledge
  for delete
  using (
    (select public.is_project_member(project_id))
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_knowledge.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('owner', 'collaborator')
    )
  );
