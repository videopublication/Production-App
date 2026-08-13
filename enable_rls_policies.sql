-- 100% EXACT RLS POLICIES FROM OLD SUPABASE

-- Enable RLS on departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on departments" ON public.departments;
CREATE POLICY "Allow all for authenticated users on departments" ON public.departments FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on users" ON public.users;
CREATE POLICY "Allow all for authenticated users on users" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on equipment
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on equipment" ON public.equipment;
CREATE POLICY "Allow all for authenticated users on equipment" ON public.equipment FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on shoots
ALTER TABLE public.shoots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on shoots" ON public.shoots;
CREATE POLICY "Allow all for authenticated users on shoots" ON public.shoots FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on assignments
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on assignments" ON public.assignments;
CREATE POLICY "Allow all for authenticated users on assignments" ON public.assignments FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on planner_draft_assignments
ALTER TABLE public.planner_draft_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on planner_draft_assignments" ON public.planner_draft_assignments;
CREATE POLICY "Allow all for authenticated users on planner_draft_assignments" ON public.planner_draft_assignments FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on assignment_segments
ALTER TABLE public.assignment_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on assignment_segments" ON public.assignment_segments;
CREATE POLICY "Allow all for authenticated users on assignment_segments" ON public.assignment_segments FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on transactions" ON public.transactions;
CREATE POLICY "Allow all for authenticated users on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on leaves
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on leaves" ON public.leaves;
CREATE POLICY "Allow all for authenticated users on leaves" ON public.leaves FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on notifications" ON public.notifications;
CREATE POLICY "Allow all for authenticated users on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on logs
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users on logs" ON public.logs;
CREATE POLICY "Allow all for authenticated users on logs" ON public.logs FOR ALL USING (true) WITH CHECK (true);

