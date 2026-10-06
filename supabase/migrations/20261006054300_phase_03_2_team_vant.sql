alter table public.project_messages
  add column if not exists sender_type text not null default 'human';

alter table public.project_messages
  drop constraint if exists project_messages_sender_type_check;

alter table public.project_messages
  add constraint project_messages_sender_type_check
  check (sender_type in ('human', 'vant'));

create index if not exists project_messages_project_created_idx
  on public.project_messages (project_id, created_at);

create index if not exists project_messages_project_sender_idx
  on public.project_messages (project_id, sender_type);
