-- Add explicit shoot assignment eligibility to users.
-- Existing CREW users keep the current planner behavior; other active accounts start hidden
-- from new shoot assignment lists unless an admin enables them.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS can_be_assigned_to_shoots BOOLEAN;

UPDATE users
SET can_be_assigned_to_shoots = (role = 'CREW')
WHERE can_be_assigned_to_shoots IS NULL;

ALTER TABLE users
ALTER COLUMN can_be_assigned_to_shoots SET DEFAULT false;

ALTER TABLE users
ALTER COLUMN can_be_assigned_to_shoots SET NOT NULL;

COMMENT ON COLUMN users.can_be_assigned_to_shoots IS
'Controls whether this user appears in shoot planner assignment pools.';
