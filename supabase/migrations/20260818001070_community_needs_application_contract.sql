-- Restore the application-facing community-needs contract without rewriting
-- the foundational need fields or any historical actor identifiers.
BEGIN;

ALTER TABLE public.community_needs
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS affected_count integer,
  ADD COLUMN IF NOT EXISTS assessment_date date,
  ADD COLUMN IF NOT EXISTS resolved boolean,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.community_needs
SET title = coalesce(nullif(btrim(title), ''), left(need_description, 180)),
    description = coalesce(description, need_description),
    priority = coalesce(priority, CASE
      WHEN priority_score >= 5 THEN 'critical'
      WHEN priority_score >= 4 THEN 'high'
      WHEN priority_score >= 2 THEN 'medium'
      ELSE 'low'
    END),
    assessment_date = coalesce(assessment_date, identified_date),
    resolved = coalesce(resolved, status = 'addressed'),
    updated_at = coalesce(updated_at, created_at)
WHERE title IS NULL OR btrim(title) = ''
   OR description IS NULL
   OR priority IS NULL
   OR assessment_date IS NULL
   OR resolved IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.community_needs
  ALTER COLUMN source SET DEFAULT 'assembly',
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN priority SET NOT NULL,
  ALTER COLUMN assessment_date SET NOT NULL,
  ALTER COLUMN resolved SET DEFAULT false,
  ALTER COLUMN resolved SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.community_needs
  DROP CONSTRAINT IF EXISTS community_needs_title_check,
  DROP CONSTRAINT IF EXISTS community_needs_priority_check,
  DROP CONSTRAINT IF EXISTS community_needs_affected_count_check;

ALTER TABLE public.community_needs
  ADD CONSTRAINT community_needs_title_check CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
  ADD CONSTRAINT community_needs_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD CONSTRAINT community_needs_affected_count_check CHECK (affected_count IS NULL OR affected_count BETWEEN 0 AND 1000000);

CREATE OR REPLACE FUNCTION public.sync_community_need_application_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.source := coalesce(nullif(btrim(NEW.source), ''), 'assembly');
  NEW.status := coalesce(nullif(btrim(NEW.status), ''), 'identified');
  NEW.identified_date := coalesce(NEW.identified_date, NEW.assessment_date, CURRENT_DATE);
  NEW.assessment_date := coalesce(NEW.assessment_date, NEW.identified_date, CURRENT_DATE);

  IF TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.need_description := coalesce(nullif(btrim(NEW.description), ''), nullif(btrim(NEW.title), ''), NEW.need_description);
  ELSIF NEW.need_description IS DISTINCT FROM OLD.need_description THEN
    NEW.description := NEW.need_description;
  END IF;

  NEW.title := coalesce(nullif(btrim(NEW.title), ''), left(NEW.need_description, 180));
  NEW.description := coalesce(NEW.description, NEW.need_description);
  NEW.need_description := coalesce(nullif(btrim(NEW.need_description), ''), NEW.description, NEW.title);

  IF TG_OP = 'INSERT' AND NEW.priority IS NULL AND NEW.priority_score IS NOT NULL THEN
    NEW.priority := CASE
      WHEN NEW.priority_score >= 5 THEN 'critical'
      WHEN NEW.priority_score >= 4 THEN 'high'
      WHEN NEW.priority_score >= 2 THEN 'medium'
      ELSE 'low'
    END;
  ELSIF TG_OP = 'INSERT' OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    NEW.priority_score := CASE NEW.priority
      WHEN 'critical' THEN 5
      WHEN 'high' THEN 4
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 1
      ELSE coalesce(NEW.priority_score, 3)
    END;
  ELSIF NEW.priority_score IS DISTINCT FROM OLD.priority_score THEN
    NEW.priority := CASE
      WHEN NEW.priority_score >= 5 THEN 'critical'
      WHEN NEW.priority_score >= 4 THEN 'high'
      WHEN NEW.priority_score >= 2 THEN 'medium'
      ELSE 'low'
    END;
  END IF;

  NEW.priority := coalesce(NEW.priority, CASE
    WHEN NEW.priority_score >= 5 THEN 'critical'
    WHEN NEW.priority_score >= 4 THEN 'high'
    WHEN NEW.priority_score >= 2 THEN 'medium'
    ELSE 'low'
  END);
  NEW.priority_score := coalesce(NEW.priority_score, 3);

  IF TG_OP = 'UPDATE' AND NEW.assessment_date IS DISTINCT FROM OLD.assessment_date THEN
    NEW.identified_date := NEW.assessment_date;
  ELSIF TG_OP = 'UPDATE' AND NEW.identified_date IS DISTINCT FROM OLD.identified_date THEN
    NEW.assessment_date := NEW.identified_date;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.resolved IS DISTINCT FROM OLD.resolved THEN
    NEW.status := CASE WHEN NEW.resolved THEN 'addressed' ELSE 'identified' END;
  ELSIF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.resolved := NEW.status = 'addressed';
  END IF;

  NEW.resolved := coalesce(NEW.resolved, false);
  NEW.updated_at := CASE WHEN TG_OP = 'UPDATE' THEN now() ELSE coalesce(NEW.updated_at, now()) END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_needs_application_contract_sync ON public.community_needs;
CREATE TRIGGER community_needs_application_contract_sync
BEFORE INSERT OR UPDATE ON public.community_needs
FOR EACH ROW EXECUTE FUNCTION public.sync_community_need_application_contract();

REVOKE ALL ON FUNCTION public.sync_community_need_application_contract() FROM PUBLIC, anon, authenticated;

COMMIT;
