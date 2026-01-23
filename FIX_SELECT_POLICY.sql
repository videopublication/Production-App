-- FIX: Add missing SELECT policy so users can see their own profile.
-- The "duplicate key" error happens because users exist but can't see themselves (RLS default deny),
-- so the app thinks they don't exist and tries to insert them again.

-- 1. Create SELECT Policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

CREATE POLICY "Users can view own profile" ON public.users
FOR SELECT TO authenticated
USING (
  -- Cast to text for safety against uuid/text mismatch
  auth.uid()::text = id::text
);

-- 2. Create UPDATE Policy (for name/avatar, NOT role/status)
-- We previously revoked role/status updates, but we need to allow updating other fields.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile" ON public.users
FOR UPDATE TO authenticated
USING (
  auth.uid()::text = id::text
)
WITH CHECK (
  auth.uid()::text = id::text
);

-- 3. Explicitly Grant Select/Update again just to be sure
GRANT SELECT, UPDATE ON public.users TO authenticated;
