-- ==========================================================
-- Migration: Add is_non_shoot column to shoots table
-- Distinguishes internal activities (orientation, asset checking, etc.) from physical production shoots
-- ==========================================================

ALTER TABLE public.shoots
ADD COLUMN IF NOT EXISTS is_non_shoot BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.shoots.is_non_shoot IS 'Distinguishes internal activities (orientation, asset checking, etc.) from physical production shoots';

-- Optional: Automatically tag known existing non-shoot activities
UPDATE public.shoots
SET is_non_shoot = true
WHERE is_non_shoot IS NULL OR is_non_shoot = false
  AND (
      LOWER(title) LIKE '%equipment orientation%'
   OR LOWER(title) LIKE '%equipment segregation%'
   OR LOWER(title) LIKE '%assets checking%'
   OR LOWER(title) LIKE '%asset check%'
   OR LOWER(title) LIKE '[non-shoot]%'
  );
