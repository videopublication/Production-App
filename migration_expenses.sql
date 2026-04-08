-- Add expenses JSONB column to shoots table
ALTER TABLE shoots
ADD COLUMN IF NOT EXISTS expenses JSONB DEFAULT '[]'::jsonb;
