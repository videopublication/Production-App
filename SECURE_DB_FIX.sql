-- Security Hardening for Users Table (Fixed Types)

-- 1. Set Defaults
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'CREW';
ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'PENDING';

-- 2. Revoke sensitive column updates
REVOKE UPDATE (role, status) ON public.users FROM authenticated;

-- 3. Enforce secure profile creation (Fixed UUID cast)
-- We need to drop the old policy if it exists to replace it or just create a new one.
-- Note: 'auth.uid()' returns a uuid, but 'id' in public.users might be text or uuid.
-- Ideally 'id' in public.users should be UUID to match auth.users.
-- If 'id' is text, we cast auth.uid() to text. If 'id' is uuid, this matches automatically.

-- Dropping potential conflicting policies to be safe (optional but recommended)
-- DROP POLICY IF EXISTS "Enforce secure profile creation" ON public.users;

CREATE POLICY "Enforce secure profile creation" ON public.users
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid()::text = id::text AND
  (role = 'CREW' OR role IS NULL) AND
  (status = 'PENDING' OR status IS NULL)
);

-- 4. Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
