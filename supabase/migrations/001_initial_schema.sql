-- ============================================================
-- Greythorn Referral System — Initial Schema
-- ============================================================

-- Enum: referral status
CREATE TYPE referral_status AS ENUM ('pending', 'not_yet_eligible', 'approved');

-- ============================================================
-- Table: profiles
-- Extends Supabase auth.users. Auto-created via trigger.
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- Table: contractors
-- Synced daily from Greythorn at 11:00 AM.
-- ============================================================
CREATE TABLE contractors (
  hr_code TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_worked_date DATE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractors_select_authenticated" ON contractors FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- Table: referrals
-- One row per registered referral.
-- ============================================================
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id),
  recruited_hr_code TEXT NOT NULL UNIQUE REFERENCES contractors(hr_code),
  recruited_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  start_date_locked BOOLEAN NOT NULL DEFAULT TRUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status referral_status NOT NULL DEFAULT 'pending',
  working_days_approved FLOAT,
  working_days_projected FLOAT,
  working_days_total FLOAT,
  last_checked_at TIMESTAMPTZ,
  last_check_snapshot JSONB,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  query_version TEXT
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_select_own" ON referrals FOR SELECT
  USING (auth.uid() = recruiter_id);
CREATE POLICY "referrals_insert_own" ON referrals FOR INSERT
  WITH CHECK (auth.uid() = recruiter_id);

-- ============================================================
-- Table: referral_checks
-- Audit trail of every working-day verification.
-- ============================================================
CREATE TABLE referral_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  query_version TEXT NOT NULL,
  start_date_filter DATE NOT NULL,
  working_days_approved FLOAT NOT NULL,
  working_days_projected FLOAT NOT NULL,
  working_days_total FLOAT NOT NULL,
  threshold_met BOOLEAN NOT NULL,
  start_date_discrepancy_flag BOOLEAN NOT NULL DEFAULT FALSE,
  check_detail JSONB NOT NULL
);

ALTER TABLE referral_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_checks_select_own" ON referral_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM referrals r
      WHERE r.id = referral_checks.referral_id
        AND r.recruiter_id = auth.uid()
    )
  );

-- ============================================================
-- Table: sync_log
-- One row per contractor sync attempt.
-- ============================================================
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  records_synced INT,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'scheduled' CHECK (triggered_by IN ('scheduled', 'manual'))
);

-- ============================================================
-- Trigger: auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_id, is_internal, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_id', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'is_internal')::boolean, true),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
