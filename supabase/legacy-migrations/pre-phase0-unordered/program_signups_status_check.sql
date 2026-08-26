-- Realign program_signups.status CHECK constraint with the values the
-- application uses.
--
-- The signup flow uses three status values:
--   * pending   — self-signup awaiting officer confirmation
--   * confirmed — officer (or staff) has assigned this volunteer
--   * withdrawn — volunteer or officer removed the signup
--
-- The original schema's CHECK constraint admits only a subset (likely just
-- 'pending' / 'confirmed') and rejects 'withdrawn' — or admits only
-- 'pending' and rejects both 'confirmed' and 'withdrawn'. Adding a
-- volunteer via the officer/partner path hits:
--   "new row for relation \"program_signups\" violates check constraint
--    \"program_signups_status_check\""
--
-- This migration normalizes any legacy values, drops the existing constraint,
-- and re-adds it with the application's vocabulary.
--
-- Safe to re-run.

-- ── 1. Normalize legacy values onto the canonical vocabulary ─────────────
UPDATE public.program_signups
   SET status = CASE status
                  WHEN 'cancelled' THEN 'withdrawn'  -- old withdraw name
                  WHEN 'rejected'  THEN 'withdrawn'
                  WHEN 'active'    THEN 'confirmed'
                  ELSE status
                END
 WHERE status IN ('cancelled', 'rejected', 'active');

-- ── 2. Backfill any unknown / NULL values to 'pending' so the new
--      constraint doesn't reject pre-existing rows ─────────────────────────
UPDATE public.program_signups
   SET status = 'pending'
 WHERE status IS NULL
    OR status NOT IN ('pending', 'confirmed', 'withdrawn');

-- ── 3. Drop the legacy constraint (idempotent) ─────────────────────────────
ALTER TABLE public.program_signups
  DROP CONSTRAINT IF EXISTS program_signups_status_check;

-- ── 4. Re-add with the application's vocabulary ───────────────────────────
ALTER TABLE public.program_signups
  ADD CONSTRAINT program_signups_status_check
  CHECK (status IN ('pending', 'confirmed', 'withdrawn'));

-- ── 5. Ensure default stays 'pending' for new self-signups ───────────────
ALTER TABLE public.program_signups
  ALTER COLUMN status SET DEFAULT 'pending';
