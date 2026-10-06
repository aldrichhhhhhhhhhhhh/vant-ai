-- VANT Phase 04B: Project Context Engine foundation
-- Read-only, project-scoped context contract for Project Chat, Team + VANT,
-- dashboard intelligence, and future Work Engine consumers.

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
