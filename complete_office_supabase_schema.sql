-- PERFECT AUTOMATED SCHEMA FROM SOURCE DATABASE

DROP TABLE IF EXISTS public.logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.leaves CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.assignment_segments CASCADE;
DROP TABLE IF EXISTS public.planner_draft_assignments CASCADE;
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.shoots CASCADE;
DROP TABLE IF EXISTS public.equipment CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;

CREATE TABLE IF NOT EXISTS public.departments (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT,
    "slug" TEXT,
    "enabled_features" TEXT[],
    "settings" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.departments DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.users (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT,
    "role" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "status" TEXT,
    "fcm_token" TEXT,
    "avatar_url" TEXT,
    "department_id" TEXT,
    "is_primary_leave_approver" BOOLEAN,
    "can_manage_expenses" BOOLEAN,
    "can_be_assigned_to_shoots" BOOLEAN
);

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.equipment (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT,
    "category" TEXT,
    "barcode" TEXT,
    "status" TEXT,
    "location" TEXT,
    "condition" TEXT,
    "assigned_to" TEXT,
    "last_activity" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "serial_number" TEXT,
    "department_id" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "notes" TEXT,
    "purchase_date" TEXT
);

ALTER TABLE public.equipment DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shoots (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" TEXT,
    "description" TEXT,
    "location" TEXT,
    "status" TEXT,
    "start_time" TIMESTAMPTZ,
    "end_time" TIMESTAMPTZ,
    "poc_name" TEXT,
    "poc_contact" TEXT,
    "required_roles" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "google_event_id" TEXT,
    "shoot_number" INTEGER,
    "department_id" TEXT,
    "jira_ticket_id" TEXT,
    "expenses" JSONB,
    "cancellation_reason" TEXT
);

ALTER TABLE public.shoots DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignments (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "shoot_id" TEXT,
    "user_id" TEXT,
    "role" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "department_id" TEXT
);

ALTER TABLE public.assignments DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.planner_draft_assignments (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "shoot_id" TEXT,
    "user_id" TEXT,
    "role" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "department_id" TEXT
);

ALTER TABLE public.planner_draft_assignments DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignment_segments (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "assignment_id" TEXT,
    "draft_assignment_id" TEXT,
    "shoot_id" TEXT,
    "user_id" TEXT,
    "start_time" TIMESTAMPTZ,
    "end_time" TIMESTAMPTZ,
    "role" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "department_id" TEXT
);

ALTER TABLE public.assignment_segments DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.transactions (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT,
    "items" TEXT[],
    "timestamp_out" TIMESTAMPTZ,
    "timestamp_in" TIMESTAMPTZ,
    "project" TEXT,
    "pre_checkout_conditions" JSONB,
    "post_return_conditions" JSONB,
    "status" TEXT,
    "notes" TEXT,
    "additional_users" TEXT[],
    "shoot_id" TEXT,
    "system_id" TEXT,
    "display_id" TEXT,
    "department_id" TEXT,
    "data_report" JSONB
);

ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.leaves (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" TEXT,
    "department_id" TEXT,
    "start_date" TEXT,
    "end_date" TEXT,
    "reason" TEXT,
    "status" TEXT,
    "approver_id" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leaves DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" TEXT,
    "title" TEXT,
    "message" TEXT,
    "link" TEXT,
    "read" BOOLEAN,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "department_id" TEXT,
    "type" TEXT
);

ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.logs (
    "id" TEXT PRIMARY KEY,
    "action" TEXT,
    "details" TEXT,
    "user_id" TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT NOW(),
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "department_id" TEXT,
    "description" TEXT,
    "entity_type" TEXT
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" TEXT,
    "user_agent" TEXT,
    "last_active_at" TIMESTAMPTZ DEFAULT NOW(),
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE ("user_id", "user_agent")
);

ALTER TABLE public.user_sessions DISABLE ROW LEVEL SECURITY;
