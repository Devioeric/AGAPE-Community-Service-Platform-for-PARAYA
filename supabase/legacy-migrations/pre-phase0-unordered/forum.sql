-- Discussion Forum — threads + flat replies for cross-role discussions.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'general',  -- "general" | "programs" | "schedule" | "barangay" | "announcement" | "question"
  author_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pinned      BOOLEAN     NOT NULL DEFAULT FALSE,
  locked      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID        NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ft_pinned_created  ON public.forum_threads(pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ft_author          ON public.forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_fp_thread          ON public.forum_posts(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fp_author          ON public.forum_posts(author_id);

ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ft_read_all"        ON public.forum_threads;
DROP POLICY IF EXISTS "ft_insert_auth"     ON public.forum_threads;
DROP POLICY IF EXISTS "ft_update_owner"    ON public.forum_threads;
DROP POLICY IF EXISTS "ft_delete_owner"    ON public.forum_threads;
DROP POLICY IF EXISTS "ft_moderate"        ON public.forum_threads;

DROP POLICY IF EXISTS "fp_read_all"        ON public.forum_posts;
DROP POLICY IF EXISTS "fp_insert_auth"     ON public.forum_posts;
DROP POLICY IF EXISTS "fp_update_owner"    ON public.forum_posts;
DROP POLICY IF EXISTS "fp_delete_owner"    ON public.forum_posts;
DROP POLICY IF EXISTS "fp_moderate"        ON public.forum_posts;

-- Threads: any authenticated user can read; authors manage their own; officers/admins moderate
CREATE POLICY "ft_read_all"     ON public.forum_threads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ft_insert_auth"  ON public.forum_threads FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "ft_update_owner" ON public.forum_threads FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "ft_delete_owner" ON public.forum_threads FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "ft_moderate"     ON public.forum_threads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('paraya_officer', 'admin')
    )
  );

-- Posts: same shape
CREATE POLICY "fp_read_all"     ON public.forum_posts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fp_insert_auth"  ON public.forum_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "fp_update_owner" ON public.forum_posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "fp_delete_owner" ON public.forum_posts FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "fp_moderate"     ON public.forum_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('paraya_officer', 'admin')
    )
  );
