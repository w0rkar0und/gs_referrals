-- Add permissions JSONB column to user_apps for sub-level access control
-- e.g. for reports app: {"deposit": true, "working-days": true}

ALTER TABLE user_apps ADD COLUMN permissions JSONB;
