-- Function to sync public.users columns to auth.users metadata
-- This ensures 'role' and 'status' are available in the JWT (session.user.app_metadata)
-- removing the need to query the database in middleware.

CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS TRIGGER AS $$
BEGIN
  -- We perform an explicit cast to UUID to avoid any type mismatch errors
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', NEW.role, 'status', NEW.status)
  WHERE id = NEW.id::uuid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Runs whenever a user is Created or Updated in public.users
DROP TRIGGER IF EXISTS on_profile_update ON public.users;
CREATE TRIGGER on_profile_update
AFTER INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE PROCEDURE public.sync_user_claims();

-- One-time backfill: Update all CURRENT users' metadata
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id, role, status FROM public.users LOOP
    UPDATE auth.users
    SET raw_app_meta_data = 
      COALESCE(raw_app_meta_data, '{}'::jsonb) || 
      jsonb_build_object('role', u.role, 'status', u.status)
    WHERE id = u.id::uuid;
  END LOOP;
END;
$$;
