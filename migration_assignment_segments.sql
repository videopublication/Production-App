create table if not exists public.assignment_segments (
    id text primary key,
    assignment_id text references public.assignments(id) on delete cascade,
    draft_assignment_id text references public.planner_draft_assignments(id) on delete cascade,
    shoot_id text not null references public.shoots(id) on delete cascade,
    user_id text not null references public.users(id) on delete cascade,
    start_time timestamptz not null,
    end_time timestamptz not null,
    role text,
    note text,
    created_by text references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    department_id uuid references public.departments(id) on delete set null,
    check (end_time > start_time),
    check (
        (assignment_id is not null and draft_assignment_id is null)
        or (assignment_id is null and draft_assignment_id is not null)
    )
);

alter table public.assignment_segments
    alter column department_id type uuid using department_id::uuid;

create index if not exists assignment_segments_assignment_id_idx
    on public.assignment_segments(assignment_id);

create index if not exists assignment_segments_draft_assignment_id_idx
    on public.assignment_segments(draft_assignment_id);

create index if not exists assignment_segments_shoot_user_idx
    on public.assignment_segments(shoot_id, user_id);

create index if not exists assignment_segments_department_id_idx
    on public.assignment_segments(department_id);

create index if not exists assignment_segments_time_idx
    on public.assignment_segments(start_time, end_time);

alter table public.assignment_segments enable row level security;

drop policy if exists assignment_segments_admin_select on public.assignment_segments;
drop policy if exists assignment_segments_admin_insert on public.assignment_segments;
drop policy if exists assignment_segments_admin_update on public.assignment_segments;
drop policy if exists assignment_segments_admin_delete on public.assignment_segments;

create policy assignment_segments_admin_select
    on public.assignment_segments
    for select
    to authenticated
    using (public.is_active_admin_for_department(department_id));

create policy assignment_segments_admin_insert
    on public.assignment_segments
    for insert
    to authenticated
    with check (public.is_active_admin_for_department(department_id));

create policy assignment_segments_admin_update
    on public.assignment_segments
    for update
    to authenticated
    using (public.is_active_admin_for_department(department_id))
    with check (public.is_active_admin_for_department(department_id));

create policy assignment_segments_admin_delete
    on public.assignment_segments
    for delete
    to authenticated
    using (public.is_active_admin_for_department(department_id));
