create table if not exists public.planner_draft_assignments (
    id text primary key,
    shoot_id text not null references public.shoots(id) on delete cascade,
    user_id text not null references public.users(id) on delete cascade,
    role text not null,
    created_by text references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    department_id uuid references public.departments(id) on delete set null,
    unique (shoot_id, user_id)
);

alter table public.planner_draft_assignments
    alter column department_id type uuid using department_id::uuid;

create index if not exists planner_draft_assignments_shoot_id_idx
    on public.planner_draft_assignments(shoot_id);

create index if not exists planner_draft_assignments_user_id_idx
    on public.planner_draft_assignments(user_id);

create index if not exists planner_draft_assignments_department_id_idx
    on public.planner_draft_assignments(department_id);

create or replace function public.is_active_admin_for_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.users profile
        where profile.id = auth.uid()::text
          and profile.status = 'ACTIVE'
          and (
              profile.role = 'SUPER_ADMIN'
              or (
                  profile.role = 'ADMIN'
                  and profile.department_id is not null
                  and profile.department_id = target_department_id
              )
          )
    );
$$;

revoke all on function public.is_active_admin_for_department(uuid) from public;
grant execute on function public.is_active_admin_for_department(uuid) to authenticated;

alter table public.planner_draft_assignments enable row level security;

drop policy if exists planner_draft_assignments_admin_select on public.planner_draft_assignments;
drop policy if exists planner_draft_assignments_admin_insert on public.planner_draft_assignments;
drop policy if exists planner_draft_assignments_admin_update on public.planner_draft_assignments;
drop policy if exists planner_draft_assignments_admin_delete on public.planner_draft_assignments;

create policy planner_draft_assignments_admin_select
    on public.planner_draft_assignments
    for select
    to authenticated
    using (public.is_active_admin_for_department(department_id));

create policy planner_draft_assignments_admin_insert
    on public.planner_draft_assignments
    for insert
    to authenticated
    with check (public.is_active_admin_for_department(department_id));

create policy planner_draft_assignments_admin_update
    on public.planner_draft_assignments
    for update
    to authenticated
    using (public.is_active_admin_for_department(department_id))
    with check (public.is_active_admin_for_department(department_id));

create policy planner_draft_assignments_admin_delete
    on public.planner_draft_assignments
    for delete
    to authenticated
    using (public.is_active_admin_for_department(department_id));
