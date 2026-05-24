-- Store one Firebase Cloud Messaging token per browser/app install.
-- This allows one user to receive push notifications on multiple devices.

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_tokens_last_seen_at_idx ON public.push_tokens(last_seen_at);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can view their own push tokens"
ON public.push_tokens
FOR SELECT
USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can delete their own push tokens"
ON public.push_tokens
FOR DELETE
USING (auth.uid()::text = user_id);

CREATE OR REPLACE FUNCTION public.set_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_push_tokens_updated_at ON public.push_tokens;
CREATE TRIGGER set_push_tokens_updated_at
BEFORE UPDATE ON public.push_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_push_tokens_updated_at();

-- Backfill existing single-device tokens into the multi-device table.
INSERT INTO public.push_tokens (user_id, token, platform, last_seen_at)
SELECT id, fcm_token, 'legacy', NOW()
FROM public.users
WHERE fcm_token IS NOT NULL AND fcm_token <> ''
ON CONFLICT (token) DO UPDATE
SET user_id = EXCLUDED.user_id,
    platform = COALESCE(public.push_tokens.platform, EXCLUDED.platform),
    last_seen_at = NOW();

NOTIFY pgrst, 'reload schema';
