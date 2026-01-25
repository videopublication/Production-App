-- TRACK_ACTIVE_SESSIONS.sql
-- Create a table to track active sessions across devices
create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_agent text,
  last_active_at timestamptz default now(),
  created_at timestamptz default now(),
  -- We use a combination of user_id and user_agent to identify a device/browser unique session
  unique(user_id, user_agent)
);

-- Enable RLS
alter table public.user_sessions enable row level security;

-- Policies
drop policy if exists "Users can view their own sessions" on public.user_sessions;
create policy "Users can view their own sessions"
  on public.user_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sessions" on public.user_sessions;
create policy "Users can insert their own sessions"
  on public.user_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sessions" on public.user_sessions;
create policy "Users can update their own sessions"
  on public.user_sessions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own sessions" on public.user_sessions;
create policy "Users can delete their own sessions"
  on public.user_sessions for delete
  using (auth.uid() = user_id);

-- Add sample comment
comment on table public.user_sessions is 'Tracks active user sessions for the Active Sessions UI section.';
