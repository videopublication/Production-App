-- EMERGENCY FIX FOR BLOCKED INSERTS
-- The previous error likely left the table with RLS enabled but NO "INSERT" policy.
-- This script cleans up and effectively re-applies the policy.

-- 1. Temporarily Disable RLS to unblock (just in case policy creation fails again)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Drop the potentially malformed or missing policy
DROP POLICY IF EXISTS "Enforce secure profile creation" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;

-- 3. Re-Create the Policy (With explicit casting for Maximum Safety)
CREATE POLICY "Enforce secure profile creation" ON public.users
FOR INSERT TO authenticated
WITH CHECK (
  -- Cast both to text to avoid UUID/Text mismatch
  auth.uid()::text = id::text 
  AND (role = 'CREW' OR role IS NULL) 
  AND (status = 'PENDING' OR status IS NULL)
);

-- 4. Re-Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Grant permissions (just in case they were lost)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
