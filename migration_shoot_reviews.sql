-- ==========================================================
-- Migration: Shoot Video Reviews for Video Publication Department
-- ==========================================================

-- 1. Create shoot_reviews table
CREATE TABLE IF NOT EXISTS public.shoot_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shoot_id TEXT NOT NULL,
    department_id TEXT,
    user_id TEXT NOT NULL,
    user_name TEXT,
    user_role TEXT,
    feedback TEXT NOT NULL,
    rating INTEGER,
    tags TEXT[],
    video_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoot_reviews_shoot_id ON public.shoot_reviews(shoot_id);
CREATE INDEX IF NOT EXISTS idx_shoot_reviews_dept_id ON public.shoot_reviews(department_id);

ALTER TABLE public.shoot_reviews DISABLE ROW LEVEL SECURITY;

-- 2. Add review columns to shoots table
ALTER TABLE public.shoots
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS review_video_url TEXT,
ADD COLUMN IF NOT EXISTS review_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_completed_by TEXT;

-- 3. Set default review_status to PENDING for existing Video Publication shoots
UPDATE public.shoots
SET review_status = 'PENDING'
WHERE review_status IS NULL
  AND (department_id = '00000000-0000-0000-0000-000000000001' OR department_id IS NULL);

-- 4. Enable shoot_reviews feature on Video Publication department
UPDATE public.departments
SET enabled_features = array_append(enabled_features, 'shoot_reviews')
WHERE slug = 'vp' AND NOT ('shoot_reviews' = ANY(enabled_features));

-- 5. Add Admin Review Decision & Scheduling fields to shoots table
-- CRITICAL REQUIREMENT: Admin only decides which shoot review is required (defaults to FALSE).
-- Only once shoot is closed can an Admin assign review & schedule crew time log.
ALTER TABLE public.shoots
ADD COLUMN IF NOT EXISTS review_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS review_assigned_to TEXT,
ADD COLUMN IF NOT EXISTS review_assigned_to_name TEXT,
ADD COLUMN IF NOT EXISTS review_scheduled_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_scheduled_end_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS linked_review_shoot_id TEXT;

CREATE INDEX IF NOT EXISTS idx_shoots_review_required ON public.shoots(review_required);
CREATE INDEX IF NOT EXISTS idx_shoots_review_assigned_to ON public.shoots(review_assigned_to);
