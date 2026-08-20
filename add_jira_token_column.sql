-- Personal Jira Personal Access Token, per user.
--
-- The profile page writes this via storage.updateUser({ jiraToken }), which maps
-- to users.jira_token. Without the column, saving a token fails — and while
-- auth.tsx named jira_token in its select alias list, a missing column turned
-- every profile fetch into a 400, so the app loaded signed-out.
--
-- Safe to re-run.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS jira_token TEXT;

COMMENT ON COLUMN public.users.jira_token IS
    'Per-user Jira Personal Access Token. When set, Jira writes (comments, transitions) are attributed to this user instead of the shared system account.';

-- A token is a credential: only the owner may read or write their own, and it
-- must never be exposed through a broad SELECT to other members.
-- Adjust to match the existing policy names on public.users if they differ.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'users'
          AND policyname = 'users_update_own_jira_token'
    ) THEN
        CREATE POLICY users_update_own_jira_token ON public.users
            FOR UPDATE
            USING (auth.uid() = id)
            WITH CHECK (auth.uid() = id);
    END IF;
END
$$;
