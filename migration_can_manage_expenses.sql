-- Add can_manage_expenses column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_expenses BOOLEAN DEFAULT false;

-- Notify PostgREST to reload the schema cache so the API picks it up immediately
NOTIFY pgrst, 'reload schema';
