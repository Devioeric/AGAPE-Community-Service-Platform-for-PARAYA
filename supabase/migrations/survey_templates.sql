-- Survey Templates (shared across all PARAYA officers)
CREATE TABLE IF NOT EXISTS public.survey_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  sections    JSONB NOT NULL DEFAULT '[]',
  questions   JSONB NOT NULL DEFAULT '[]',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;

-- All officers and admins can read every template
CREATE POLICY "officers can read survey_templates" ON public.survey_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('paraya_officer', 'admin')
    )
  );

-- Officers and admins can insert templates
CREATE POLICY "officers can insert survey_templates" ON public.survey_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('paraya_officer', 'admin')
    )
  );

-- Creator or admin can delete
CREATE POLICY "officers can delete survey_templates" ON public.survey_templates
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
