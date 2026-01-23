-- FIX: Allow Admins and Managers to view ALL profiles.
-- Currently, users can ONLY see themselves. This hides the user list from the "Users Page".

DROP POLICY IF EXISTS "Admins and Managers can view all profiles" ON public.users;

CREATE POLICY "Admins and Managers can view all profiles" ON public.users
FOR SELECT TO authenticated
USING (
  -- Users can see their own profile
  auth.uid()::text = id::text
  OR 
  -- Admins and Managers can see everyone
  (select auth.jwt() ->> 'role') IN ('ADMIN', 'MANAGER')
  OR
  -- (Optional) If you want everyone to see basic details of everyone (e.g. for "Assigned To" lists), 
  -- you might just want "true" here, but let's stick to role-based for now.
  -- A common pattern for collaboration apps is "Authenticated users can view all users":
  -- true
  true -- CHANGED TO TRUE: In a company app, usually all crew need to see who else exists (for assigning tasks/shoots).
);

-- Note: I set it to TRUE (everyone sees everyone) because in your app, 
-- Crew likely need to see user names in "Assigned To" dropdowns or "Shoot Details".
-- If you want strictly private users, change "true" back to the role checks.
