alter table public.shoots
add column if not exists cancellation_reason text;
