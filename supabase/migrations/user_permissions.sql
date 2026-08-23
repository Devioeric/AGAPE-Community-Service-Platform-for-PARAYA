-- Add permissions JSONB column for per-user module toggles
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';

-- Add barangay_id if it doesn't exist
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS barangay_id UUID REFERENCES public.barangays(id) ON DELETE SET NULL;

-- Allow users to update their own profile (needed for accept-invite setup flow)
DROP POLICY IF EXISTS "users can update own profile" ON public.users;
CREATE POLICY "users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
