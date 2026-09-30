-- TRUNCATE bypasses RLS and the row-level completion/evidence triggers.
-- Browser actors must not bypass those invariants through inherited ALL grants.
-- Trusted maintenance authority and ordinary RLS-protected DML are unchanged.
BEGIN;

REVOKE TRUNCATE ON TABLE public.programs, public.program_activities,
 public.activity_photos, public.program_budgets, public.program_signups
 FROM PUBLIC, anon, authenticated;

COMMIT;
