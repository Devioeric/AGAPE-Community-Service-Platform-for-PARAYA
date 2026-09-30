-- Inbox access is actor-scoped self-service, independent of forum permissions.
-- Preserve trusted delivery workers and existing positive own-row policies.
BEGIN;
SET LOCAL search_path=pg_catalog,public;

DROP POLICY IF EXISTS phase1_deny_override_guard ON public.notifications;
CREATE POLICY phase1_deny_override_guard ON public.notifications
 AS RESTRICTIVE FOR ALL TO authenticated
 USING (
  user_id=(SELECT auth.uid())
  AND (SELECT public.phase0_current_account_is_active())
  AND (SELECT public.get_user_role()) IN('admin','paraya_director','paraya_associate','paraya_researcher','finance_officer','barangay_secretary','volunteer')
 )
 WITH CHECK (
  user_id=(SELECT auth.uid())
  AND (SELECT public.phase0_current_account_is_active())
  AND (SELECT public.get_user_role()) IN('admin','paraya_director','paraya_associate','paraya_researcher','finance_officer','barangay_secretary','volunteer')
 );

-- Baseline ALL grants allowed own-row content/ownership changes and TRUNCATE.
-- The client contract permits only reading an inbox and marking its read state.
-- service_role grants are deliberately unchanged for trusted notification dispatch.
REVOKE ALL ON public.notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;
COMMIT;
