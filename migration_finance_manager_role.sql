-- Drop the existing role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add the updated check constraint that includes 'FINANCE_MANAGER'
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'MANAGER', 'CREW'));

-- Notify PostgREST to reload the schema cache so the API picks it up immediately
NOTIFY pgrst, 'reload schema';
