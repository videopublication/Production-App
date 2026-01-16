-- Create Shoots table
create table public.shoots (
  id text not null primary key,
  title text not null,
  description text,
  location text not null,
  status text check (status in ('CONFIRMED', 'TENTATIVE', 'CANCELLED')),
  start_time timestamp with time zone not null,
  end_time timestamp with time zone,
  poc_name text,
  poc_contact text,
  required_roles jsonb default '[]'::jsonb,
  created_by text,
  created_at timestamp with time zone default now()
);

-- Create Assignments table
create table public.assignments (
  id text not null primary key,
  shoot_id text references public.shoots(id) on delete cascade,
  user_id text references public.users(id) on delete cascade,
  role text not null,
  status text default 'PENDING',
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.shoots enable row level security;
alter table public.assignments enable row level security;

-- Policies
create policy "Enable all access for authenticated users" on public.shoots
  for all using (auth.role() = 'authenticated');

create policy "Enable all access for authenticated users" on public.assignments
  for all using (auth.role() = 'authenticated');
