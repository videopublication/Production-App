-- Adds the DATA_MANAGER role: the data team who custody memory cards, hard disks,
-- laptops, card readers and similar items, lend them out, and verify them on return
-- (copying footage off a card and wiping it before it can be lent again).
--
-- users.role is plain text guarded by a named CHECK constraint, so adding a value means
-- dropping and re-adding the constraint. Same shape as migration_finance_manager_role.sql.
--
-- setup_custom_claims.sql needs no change: its trigger copies whatever string is in
-- users.role into the JWT app_metadata, so the new role propagates on the next write.

-- Drop the existing role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add the updated check constraint that includes 'DATA_MANAGER'
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'DATA_MANAGER', 'MANAGER', 'CREW'));

-- Notify PostgREST to reload the schema cache so the API picks it up immediately
NOTIFY pgrst, 'reload schema';
