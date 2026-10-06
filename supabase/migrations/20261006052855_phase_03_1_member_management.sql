-- VANT Phase 03.1: member management foundation
-- Additive only. Do not modify historical collaboration migrations.

create or replace function public.leave_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    raise exception 'owner_cannot_leave';
  end if;
  delete from public.project_members where project_id = p_project_id and user_id = auth.uid();
end;
$function$;

create or replace function public.manage_project_member(
  p_project_id uuid, p_user_id uuid, p_action text, p_role text default null
)
returns table(user_id uuid, email text, display_name text, role text)
language plpgsql security definer set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    raise exception 'not_project_owner';
  end if;
  if p_action = 'remove' then
    delete from public.project_members where project_id = p_project_id and user_id = p_user_id and role <> 'owner';
  elsif p_action = 'change_role' then
    if p_role not in ('collaborator','viewer') then raise exception 'invalid_role'; end if;
    update public.project_members set role = p_role
    where project_id = p_project_id and user_id = p_user_id and role <> 'owner';
  else
    raise exception 'invalid_action';
  end if;
  return query
  select pm.user_id, pm.email, pm.display_name, pm.role
  from public.project_members pm
  where pm.project_id = p_project_id and pm.user_id = p_user_id;
end;
$function$;

revoke all on function public.leave_project(uuid) from public;
grant execute on function public.leave_project(uuid) to authenticated;
revoke all on function public.manage_project_member(uuid,uuid,text,text) from public;
grant execute on function public.manage_project_member(uuid,uuid,text,text) to authenticated;
