alter table public.shoots
    drop constraint if exists shoots_status_check;

alter table public.shoots
    add constraint shoots_status_check
    check (status in ('DRAFT', 'CONFIRMED', 'CANCELLED'));
