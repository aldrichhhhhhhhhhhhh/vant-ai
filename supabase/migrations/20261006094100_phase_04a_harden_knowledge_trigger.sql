-- VANT Phase 04A hardening
-- The knowledge updated_at trigger does not need SECURITY DEFINER.
alter function public.touch_project_knowledge_updated_at()
  security invoker;

revoke all on function public.touch_project_knowledge_updated_at() from public;
revoke all on function public.touch_project_knowledge_updated_at() from anon;
revoke all on function public.touch_project_knowledge_updated_at() from authenticated;
