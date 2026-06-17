-- Row-Level Security policies for public.logs
--
-- Why: The Activity History on transactions/[id] queries `logs` directly from the
-- browser via supabase-js. Without RLS, every authenticated user could read every
-- log row, leaking activity across departments. This migration enforces:
--
--   SELECT  -> own row (user_id matches) OR same department OR ADMIN/SUPER_ADMIN
--   INSERT  -> authenticated user inserting their own user_id (or system NULL)
--   UPDATE  -> blocked (logs are append-only audit trail)
--   DELETE  -> blocked (logs are append-only audit trail)
--
-- Run this once against your Supabase project. Safe to re-run -- guarded with IF.

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- SELECT: own log, same-department log, or any log for elevated roles.
DROP POLICY IF EXISTS "logs_select_scoped" ON public.logs;
CREATE POLICY "logs_select_scoped"
ON public.logs
FOR SELECT
USING (
    auth.uid()::text = user_id
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()::text
          AND (
              u.role IN ('ADMIN', 'SUPER_ADMIN')
              OR (
                  u.department_id IS NOT NULL
                  AND public.logs.department_id IS NOT NULL
                  AND u.department_id = public.logs.department_id
              )
          )
    )
);

-- INSERT: caller must claim their own user_id, or pass NULL for system logs.
DROP POLICY IF EXISTS "logs_insert_self" ON public.logs;
CREATE POLICY "logs_insert_self"
ON public.logs
FOR INSERT
WITH CHECK (
    user_id IS NULL
    OR auth.uid()::text = user_id
);

-- UPDATE / DELETE: not allowed. Audit logs are append-only.
DROP POLICY IF EXISTS "logs_no_update" ON public.logs;
CREATE POLICY "logs_no_update"
ON public.logs
FOR UPDATE
USING (false);

DROP POLICY IF EXISTS "logs_no_delete" ON public.logs;
CREATE POLICY "logs_no_delete"
ON public.logs
FOR DELETE
USING (false);

-- Helpful indexes for the per-transaction Activity History query
-- (in (entity_id IN (...)) WHERE timestamp BETWEEN ... ORDER BY timestamp DESC).
CREATE INDEX IF NOT EXISTS logs_entity_id_timestamp_idx
    ON public.logs (entity_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS logs_department_id_timestamp_idx
    ON public.logs (department_id, timestamp DESC);

NOTIFY pgrst, 'reload schema';
