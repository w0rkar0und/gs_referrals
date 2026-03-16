-- Multi-app platform: user_apps table
-- Maps users to the apps they are authorised to access.
-- Platform admins (profiles.is_admin = true) bypass this check and can access all apps.

CREATE TABLE user_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_slug TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, app_slug)
);

ALTER TABLE user_apps ENABLE ROW LEVEL SECURITY;

-- Users can read their own app assignments
CREATE POLICY "user_apps_select_own" ON user_apps FOR SELECT
  USING (auth.uid() = user_id);

-- Migrate all existing non-admin users: grant 'referrals' access
INSERT INTO user_apps (user_id, app_slug)
SELECT id, 'referrals'
FROM profiles
WHERE is_admin = false;

-- Also grant admins referrals access (so they show in the table, even though they bypass checks)
INSERT INTO user_apps (user_id, app_slug)
SELECT id, 'referrals'
FROM profiles
WHERE is_admin = true;
