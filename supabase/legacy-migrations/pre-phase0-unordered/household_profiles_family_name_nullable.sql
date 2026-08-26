-- Drop NOT NULL on household_profiles.family_name.
--
-- Production has a `family_name TEXT NOT NULL` column from the original
-- schema, but the household profiling form + /api/household-profiles route
-- only capture `head_of_household`. New inserts fail with:
--   "null value in column \"family_name\" of relation \"household_profiles\"
--    violates not-null constraint"
--
-- The application doesn't model `family_name` separately — `head_of_household`
-- is the functional equivalent. Making the column nullable unblocks inserts
-- without forcing a rewrite of the form (or losing whatever historical data
-- already lives in the column).
--
-- If you later want `family_name` to be a distinct field, add it to the form
-- and the API insert payload, then re-tighten this constraint.
--
-- Safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'household_profiles'
       AND column_name  = 'family_name'
       AND is_nullable  = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.household_profiles ALTER COLUMN family_name DROP NOT NULL';
  END IF;
END $$;
