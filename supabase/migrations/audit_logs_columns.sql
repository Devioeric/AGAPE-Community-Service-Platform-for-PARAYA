-- Audit Logs — ensure full column set for the existing audit_logs table.
-- The table already exists in the project; this just adds missing columns.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  user_email    TEXT,
  action        TEXT        NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  level         TEXT        NOT NULL DEFAULT 'info',  -- "info" | "warning" | "error"
  ip_address    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_email    TEXT;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS action        TEXT;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS resource_id   TEXT;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS level         TEXT        NOT NULL DEFAULT 'info';
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_address    TEXT;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata      JSONB;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_created  ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_level    ON public.audit_logs(level);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_all" ON public.audit_logs;

-- Only admins can read or write audit logs (writes also done via service role)
CREATE POLICY "audit_admin_all" ON public.audit_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
