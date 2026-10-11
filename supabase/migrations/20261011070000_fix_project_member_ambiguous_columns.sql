-- Fix ambiguous output-column references in project member management.
-- The function returns a column named user_id, so all table columns must be qualified.

create or replace function public.manage_project_member(
  p_project_id uuid, p_user_id uuid, p_action text, p_role text default null
)
returns table(user_id uuid, email text, display_name text, role text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.projects as p
    where p.id = p_project_id
      and p.owner_id = auth.uid()
  ) then
    raise exception 'not_project_owner';
  end if;

  if p_action = 'remove' then
    delete from public.project_members as pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.role <> 'owner';
  elsif p_action = 'change_role' then
    if p_role not in ('collaborator', 'viewer') then
      raise exception 'invalid_role';
    end if;
    update public.project_members as pm
    set role = p_role
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.role <> 'owner';
  elsif p_action = 'change_project_role' then
    if p_role not in (
      'Project Lead', 'Product Owner', 'Developer', 'Designer', 'Operations',
      'Analyst', 'QA / Tester', 'Marketing', 'Finance', 'Stakeholder', 'Contributor'
    ) then
      raise exception 'invalid_project_role';
    end if;
    update public.project_members as pm
    set project_role = p_role
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.role <> 'owner';
  else
    raise exception 'invalid_action';
  end if;

  return query
  select pm.user_id, pm.email, pm.display_name, pm.role
  from public.project_members as pm
  where pm.project_id = p_project_id
    and pm.user_id = p_user_id;
end;
$function$;

revoke all on function public.manage_project_member(uuid, uuid, text, text) from public;
grant execute on function public.manage_project_member(uuid, uuid, text, text) to authenticated;