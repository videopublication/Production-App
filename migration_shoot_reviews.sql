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
