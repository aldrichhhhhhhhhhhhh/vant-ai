-- VANT Phase 03: preserve the working project invitation RPC.
-- Fixes PL/pgSQL name collisions between RETURNS TABLE output names
-- and auth.users/project_members column names.

create or replace function public.invite_project_member(
  p_project_id uuid,
  p_email text,
  p_role text default 'collaborator'
)
returns table(user_id uuid, email text, display_name text, role text)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  target_user auth.users%rowtype;
  target_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.projects
    where id = p_project_id
      and owner_id = auth.uid()
  ) then
    raise exception 'not_project_owner';
  end if;

  if p_role not in ('collaborator','viewer') then
    raise exception 'invalid_role';
  end if;

  select u.*
  into target_user
  from auth.users as u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if target_user.id is null then
    raise exception 'user_not_found';
  end if;

  target_name := coalesce(
    target_user.raw_user_meta_data->>'name',
    split_part(coalesce(target_user.email,''),'@',1),
    'VANT User'
  );

  insert into public.project_members(
    project_id,
    user_id,
    role,
    email,
    display_name
  )
  values (
    p_project_id,
    target_user.id,
    p_role,
    target_user.email::text,
    target_name
  )
  on conflict (project_id, user_id)
  do update set
    role = excluded.role,
    email = excluded.email,
    display_name = excluded.display_name;

  return query
  select target_user.id, target_user.email::text, target_name, p_role;
end;
$function$;
