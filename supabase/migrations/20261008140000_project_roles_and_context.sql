-- VANT Project Workspace: meaningful project roles
-- Keeps access role (owner/collaborator/viewer) separate from the member's project role.

alter table public.project_members
  add column if not exists project_role text not null default 'Contributor';

update public.project_members
set project_role = case
  when role = 'owner' then 'Project Lead'
  when role = 'viewer' then 'Stakeholder'
  else coalesce(nullif(project_role, ''), 'Contributor')
end
where project_role is null or project_role = '';

create index if not exists project_members_project_role_idx
  on public.project_members (project_id, project_role);

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
  elsif p_action = 'change_project_role' then
    if p_role not in ('Project Lead','Product Owner','Developer','Designer','Operations','Analyst','QA / Tester','Marketing','Finance','Stakeholder','Contributor') then
      raise exception 'invalid_project_role';
    end if;
    update public.project_members set project_role = p_role
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

revoke all on function public.manage_project_member(uuid,uuid,text,text) from public;
grant execute on function public.manage_project_member(uuid,uuid,text,text) to authenticated;

create or replace function public.get_project_context(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_project jsonb;
  v_membership jsonb;
  v_members jsonb;
  v_knowledge jsonb;
  v_activity jsonb;
  v_team_messages jsonb;
  v_project_chats jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_uid
  ) and not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = v_uid
  ) then
    raise exception 'project_access_denied';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', coalesce(p.description, ''),
    'color', coalesce(p.color, 'violet'),
    'icon', coalesce(p.icon, 'folder'),
    'priority', coalesce(p.priority, 'moderate'),
    'owner_id', p.owner_id,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  )
  into v_project
  from public.projects p
  where p.id = p_project_id;

  select jsonb_build_object(
    'user_id', v_uid,
    'role', coalesce(
      (
        select pm.role
        from public.project_members pm
        where pm.project_id = p_project_id
          and pm.user_id = v_uid
        limit 1
      ),
      case
        when (v_project->>'owner_id')::uuid = v_uid then 'owner'
        else 'viewer'
      end
    )
  )
  into v_membership;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', pm.user_id,
        'role', pm.role,
        'project_role', coalesce(pm.project_role, case when pm.role = 'owner' then 'Project Lead' when pm.role = 'viewer' then 'Stakeholder' else 'Contributor' end),
        'email', pm.email,
        'display_name', pm.display_name,
        'created_at', pm.created_at
      )
      order by pm.created_at asc
    ),
    '[]'::jsonb
  )
  into v_members
  from public.project_members pm
  where pm.project_id = p_project_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pk.id,
        'title', pk.title,
        'content', pk.content,
        'knowledge_type', pk.knowledge_type,
        'source_type', pk.source_type,
        'source_id', pk.source_id,
        'metadata', pk.metadata,
        'created_by', pk.created_by,
        'created_at', pk.created_at,
        'updated_at', pk.updated_at
      )
      order by pk.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_knowledge
  from (
    select *
    from public.project_knowledge
    where project_id = p_project_id
    order by updated_at desc
    limit 50
  ) pk;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pa.id,
        'user_id', pa.user_id,
        'type', pa.type,
        'metadata', pa.metadata,
        'created_at', pa.created_at
      )
      order by pa.created_at desc
    ),
    '[]'::jsonb
  )
  into v_activity
  from (
    select *
    from public.project_activity
    where project_id = p_project_id
    order by created_at desc
    limit 40
  ) pa;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pm.id,
        'user_id', pm.user_id,
        'sender_type', pm.sender_type,
        'content', pm.content,
        'created_at', pm.created_at,
        'edited_at', pm.edited_at
      )
      order by pm.created_at desc
    ),
    '[]'::jsonb
  )
  into v_team_messages
  from (
    select *
    from public.project_messages
    where project_id = p_project_id
    order by created_at desc
    limit 40
  ) pm;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cc.id,
        'title', cc.title,
        'pinned', cc.pinned,
        'messages', cc.messages,
        'created_at', cc.created_at,
        'updated_at', cc.updated_at
      )
      order by cc.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_project_chats
  from (
    select *
    from public.chat_conversations
    where project_id = p_project_id::text
      and user_id = v_uid
    order by updated_at desc
    limit 10
  ) cc;

  return jsonb_build_object(
    'project', coalesce(v_project, '{}'::jsonb),
    'membership', coalesce(v_membership, '{}'::jsonb),
    'members', coalesce(v_members, '[]'::jsonb),
    'knowledge', coalesce(v_knowledge, '[]'::jsonb),
    'activity', coalesce(v_activity, '[]'::jsonb),
    'team_messages', coalesce(v_team_messages, '[]'::jsonb),
    'project_chats', coalesce(v_project_chats, '[]'::jsonb),
    'generated_at', now()
  );
end;
$function$;

revoke all on function public.get_project_context(uuid) from public;
revoke all on function public.get_project_context(uuid) from anon;
grant execute on function public.get_project_context(uuid) to authenticated;
