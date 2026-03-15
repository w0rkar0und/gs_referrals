# CLAUDE.md — Greythorn Referral System
## Claude Code Project Briefing

This file is the authoritative briefing document for building the Greythorn Referral System.
Read it fully before taking any action. All architectural decisions documented here are final
unless explicitly overridden by the user in the current session.

---

## Project Overview

A self-service referral registration and verification system for Greythorn fleet operations.
Recruiting staff (internal and external) register contractor referrals via a web form.
An admin (the operator) runs periodic working-day checks against the Greythorn MSSQL database
via Claude Code scripts, and results are written back to Supabase. Approval status is visible
to recruiters via their portal.

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | Hosted on Vercel |
| Database + Auth | Supabase (Postgres) | Row Level Security enforced |
| Repository | GitHub | Already initialised by user |
| Sync/Check Scripts | Python 3.9 | Run via self-hosted GitHub Actions runner on work PC |
| Greythorn DB | Microsoft SQL Server | Accessed via pyodbc in Python scripts (network access required) |
| Cron (sync) | GitHub Actions — self-hosted runner | Daily contractor sync at 11:00 AM on work PC |
| Cron (missed sync check) | Vercel cron | Runs at 13:00 daily — emails admins if sync hasn't run |
| Email notifications | Resend | Free tier. Requires a verified sender domain. |

---

## Repository Structure

Build to this exact structure:

```
greythorn-referrals/
├── .github/
│   └── workflows/
│       └── contractor-sync.yml          # Self-hosted runner — 11AM daily
├── app/                                 # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx                         # Redirects to /login or /referrals
│   ├── login/
│   │   └── page.tsx
│   ├── referrals/
│   │   └── page.tsx                     # Recruiter portal — My Referrals view
│   ├── submit/
│   │   └── page.tsx                     # New referral submission form
│   ├── admin/
│   │   ├── page.tsx                     # Admin dashboard — all referrals + sync status
│   │   └── users/
│   │       └── page.tsx                 # Admin user provisioning
│   └── api/
│       ├── validate-hrcode/
│       │   └── route.ts                 # HR code + rehire check
│       └── cron/
│           └── check-sync/
│               └── route.ts             # Vercel cron — missed sync detection + email
├── components/
│   ├── HrCodeInput.tsx
│   ├── ReferralForm.tsx
│   ├── ReferralTable.tsx
│   ├── SyncStatusBanner.tsx             # Admin dashboard banner — shows last sync time
│   └── AdminTable.tsx
├── lib/
│   ├── supabase.ts                      # Supabase client (browser)
│   ├── supabase-server.ts               # Supabase client (server/RSC)
│   └── types.ts
├── scripts/
│   ├── contractor_sync.py               # Greythorn → Supabase (runs on work PC)
│   └── referral_check.py               # Working day verification (runs in Claude Code)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── vercel.json                          # Vercel cron schedule configuration
├── .env.example
├── .env.local
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Environment Variables

### `.env.example` (commit this — empty values only)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=
NOTIFY_TO_EMAILS=
CRON_SECRET=
```

### `.env.local` (never commit — populate locally and in Vercel)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Email notifications (Resend — https://resend.com)
# Verified sender domain: greythornservices.uk
RESEND_API_KEY=re_...
NOTIFY_FROM_EMAIL=notifications@greythornservices.uk
NOTIFY_TO_EMAILS=                                # Comma-separated admin email(s) — operator to fill in

# Cron security — generate with: openssl rand -hex 32
CRON_SECRET=your-random-secret-here
```

### Python scripts only — `.env` in scripts/ directory (never commit)
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GT_DB_SERVER=
GT_DB_NAME=
GT_DB_USER=
GT_DB_PASSWORD=
GT_DB_PORT=1433
```

**GitHub Actions Secrets** (repo → Settings → Secrets → Actions — required for self-hosted runner):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GT_DB_SERVER`
- `GT_DB_NAME`
- `GT_DB_USER`
- `GT_DB_PASSWORD`
- `GT_DB_PORT`

---

## Database Schema

### Enums

```sql
CREATE TYPE referral_status AS ENUM ('pending', 'not_yet_eligible', 'approved');
```

### Table: `profiles`
Extends Supabase `auth.users`. Created automatically on user signup via trigger.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,          -- HR code (X######) or j.smith for external
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `contractors`
Synced daily from Greythorn at 11:00 AM. Source of truth for HR code validation.

```sql
CREATE TABLE contractors (
  hr_code TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_worked_date DATE,             -- NULL = never worked. From most recent approved debrief.
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `referrals`
One row per registered referral. All fields lock on insert. Only admins may update.

```sql
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
```

### Table: `referral_checks`
One row per check event. Full audit trail of every working-day verification.

```sql
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
```

### Table: `sync_log`
One row per contractor sync attempt. Used by the missed-sync detection cron to determine whether today's sync ran.

```sql
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  records_synced INT,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'scheduled' CHECK (triggered_by IN ('scheduled', 'manual'))
);
```

### `check_detail` JSONB structure (reference)
```json
{
  "start_date_filter": "2026-01-06",
  "query_version": "v1.0",
  "first_rota_date": "2026-01-07",
  "start_date_discrepancy_days": 1,
  "rows": [
    {
      "source": "Approved",
      "year": 2026,
      "week": 3,
      "week_start": "13/01/2026",
      "week_end": "17/01/2026",
      "contract_type": "DPD Full Day",
      "shift_count": 5,
      "working_days": 5.0
    }
  ]
}
```

---

## Row Level Security Policies

Apply after creating tables. These are non-negotiable security requirements.

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_checks ENABLE ROW LEVEL SECURITY;

-- profiles: users read/update their own row only
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- contractors: all authenticated users can read (needed for form validation)
CREATE POLICY "contractors_select_authenticated" ON contractors FOR SELECT
  USING (auth.role() = 'authenticated');

-- referrals: users see only their own; INSERT only; no UPDATE for non-admins
CREATE POLICY "referrals_select_own" ON referrals FOR SELECT
  USING (auth.uid() = recruiter_id);
CREATE POLICY "referrals_insert_own" ON referrals FOR INSERT
  WITH CHECK (auth.uid() = recruiter_id);

-- referral_checks: users can read checks for their own referrals
CREATE POLICY "referral_checks_select_own" ON referral_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM referrals r
      WHERE r.id = referral_checks.referral_id
        AND r.recruiter_id = auth.uid()
    )
  );

-- Admin bypass: service role key (used by Python scripts) bypasses RLS entirely.
-- Admin UI updates use service role key server-side — never expose in browser.
```

### Profile auto-creation trigger
```sql
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
```

---

## Error Codes

| Code | Trigger | User-Facing Message |
|---|---|---|
| `REF-001` | Duplicate HR code | "This HR code has already been registered by another user. If you believe this is an error, please contact SLT quoting reference REF-001." |
| `REF-002` | Rehire within 6 months | "This contractor's last recorded working day falls within six months of the submitted start date. This referral cannot be accepted. If you believe this is an error, please contact SLT quoting reference REF-002." |

### REF-001 Logic
Triggered when a Postgres unique constraint violation occurs on `referrals.recruited_hr_code`.
Catch error code `23505` in the Supabase JS client and map to REF-001 message.

### REF-002 Logic
Evaluated client-side before submission using data from the `contractors` table sync.
```
IF contractors.last_worked_date IS NOT NULL
AND submitted_start_date - contractors.last_worked_date < 180 days
→ Block submission, show REF-002 message
```
The 180-day threshold (6 months) is calculated as a fixed day count for consistency.

---

## HR Code Validation Flow (Form Submission)

On the `HrCodeInput` component, as the user types (debounced 400ms):

1. Query `contractors` table: `SELECT * FROM contractors WHERE hr_code = input.toUpperCase()`
2. If no record → show inline error: *"HR code not found. Please check and try again."*
3. If record found but `is_active = false` → show inline error: *"This contractor is not currently active."*
4. If record found and active:
   - Auto-populate name field from `first_name + ' ' + last_name`
   - Run REF-002 check against `last_worked_date` and the entered start date
   - If REF-002 triggered → show error, block submission
   - Otherwise → enable submit button
5. On submit → attempt Supabase insert → catch `23505` → show REF-001 if triggered

---

## Recruiter Portal — My Referrals View

Shows only the authenticated user's own referrals. Read-only. No working day counts shown.

| Column | Source |
|---|---|
| Contractor Name | `referrals.recruited_name` |
| HR Code | `referrals.recruited_hr_code` |
| Start Date | `referrals.start_date` (formatted DD/MM/YYYY) |
| Submitted | `referrals.submitted_at` (formatted DD/MM/YYYY) |
| Status | `referrals.status` — display as: Pending / Not Yet Eligible / Approved |

Status badge colours: Pending = grey, Not Yet Eligible = amber, Approved = green.

---

## Admin View

Accessible only to users where `profiles.is_admin = true`.
Check this server-side in the Next.js page using the service role client — never trust client-side only.

Admin view shows all referrals across all users. Additional columns:
- Recruiter display_id
- Working days total (from last check)
- Last checked date
- Approval notes (editable inline)

Admin can update: `status`, `start_date`, `approval_notes`, `approved_at`.
All admin updates go via a server action using the service role key.

---

## Python Script: `contractor_sync.py`

### Purpose
Queries Greythorn MSSQL → upserts to Supabase `contractors` table → writes a row to `sync_log`.
Runs via GitHub Actions on a **self-hosted runner** installed on the operator's work PC.

### Greythorn Query
```sql
SELECT
    c.HrCode,
    up.FirstName,
    up.LastName,
    CASE WHEN c.IsActive = 1 THEN 1 ELSE 0 END AS IsActive,
    CONVERT(VARCHAR(10), MAX(CAST(d.Date AS DATE)), 120) AS LastWorkedDate
FROM Contractor c
JOIN [User] u ON u.UserId = c.UserId
JOIN UserProfile up ON up.UserId = u.UserId
LEFT JOIN Debrief d ON d.ContractorId = c.ContractorId AND d.IsApproved = 1
GROUP BY c.HrCode, up.FirstName, up.LastName, c.IsActive
ORDER BY c.HrCode
```

### Behaviour
- Connects directly to Greythorn SQL Server via `pyodbc`
- Upserts all records to `contractors` using `hr_code` as conflict key
- On **success**: writes `{ status: 'success', records_synced: N, triggered_by: 'scheduled' }` to `sync_log`
- On **error**: writes `{ status: 'error', error_message: str(e), triggered_by: 'scheduled' }` to `sync_log`
- Prints summary to stdout (visible in GitHub Actions run log)

### GitHub Actions Workflow: `.github/workflows/contractor-sync.yml`

```yaml
name: Contractor Sync

on:
  schedule:
    - cron: '0 11 * * *'    # 11:00 AM UTC daily
  workflow_dispatch:          # Allow manual trigger from GitHub Actions tab

jobs:
  sync:
    runs-on: self-hosted      # ← Runs on operator's work PC via self-hosted runner

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install supabase pyodbc python-dotenv

      - name: Run contractor sync
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GT_DB_SERVER: ${{ secrets.GT_DB_SERVER }}
          GT_DB_NAME: ${{ secrets.GT_DB_NAME }}
          GT_DB_USER: ${{ secrets.GT_DB_USER }}
          GT_DB_PASSWORD: ${{ secrets.GT_DB_PASSWORD }}
          GT_DB_PORT: ${{ secrets.GT_DB_PORT }}
        run: python scripts/contractor_sync.py
```

**Note:** The `runs-on: self-hosted` line directs GitHub Actions to execute this job on the
operator's registered self-hosted runner instead of GitHub's cloud infrastructure.

### Self-Hosted Runner Setup (one-time, on work PC)

Do this once in the session where Phase 1 is complete:

1. Go to GitHub repo → Settings → Actions → Runners → New self-hosted runner
2. Select OS: Windows
3. Follow the download and configure instructions shown on the page
4. When prompted for runner name, use: `greythorn-work-pc`
5. When prompted for labels, add: `self-hosted`
6. Install as a Windows Service so it starts automatically:
   ```powershell
   # Run in the Actions runner directory as Administrator
   .\svc.sh install
   .\svc.sh start
   ```
7. Verify the runner appears as "Idle" in GitHub repo → Settings → Actions → Runners

### Windows Sleep Prevention (optional but recommended)

To prevent the PC sleeping before the 11AM job runs, create a scheduled task in Windows Task Scheduler:
- **Trigger:** Daily at 10:55 AM
- **Action:** Run `powercfg /x -standby-timeout-ac 0` (disables standby temporarily)
- **Note:** This requires the PC to already be awake — it prevents sleep from kicking in,
  but does not wake a powered-off or hibernated machine.

---

## Python Script: `referral_check.py`

### Purpose
For a given HR code (or list), checks working days against Greythorn since the referral
start date, compares against 30-day threshold, and writes results to Supabase.

### Query Version
Current version string: `v1.0`
Bump to `v1.1` for minor logic changes, `v2.0` for breaking changes.
Always update the constant at the top of the script before running after any change.

### Process Flow
```
1. Read referral record from Supabase by HR code
2. If status = 'approved' → report as already approved, skip GT query
3. Query Greythorn: first rota entry date (IsNonWork = 0) for this contractor
4. Compare first_rota_date against referral.start_date
   → If difference > 7 days → set start_date_discrepancy_flag = True, log warning
5. Run Part 1 query: approved debriefs since start_date
6. Run Part 2 query: current week rota projection since start_date
7. Apply half-day rule to calculate working_days per row
8. Sum totals: working_days_approved, working_days_projected, working_days_total
9. Determine threshold_met: working_days_total >= 30
10. Build check_detail JSONB
11. Write to referral_checks table
12. Update referrals table: status, working day totals, last_checked_at, last_check_snapshot, query_version
    → If threshold_met and status != 'approved': set status = 'approved', approved_at = NOW()
    → If not threshold_met: set status = 'not_yet_eligible'
13. Print formatted summary to terminal
```

### Half-Day Rule
Contract types matching any of these patterns count as 0.5 days; all others count as 1.0:
`NL 1%`, `NL 2%`, `NL 3%`, `Nursery 1%`, `Nursery 2%`, `Nursery L1%`, `Nursery L2%`, `Nursery L3%`

### Greythorn Working Day Queries

**Part 1 — Approved debriefs since start_date:**
```sql
SELECT
    c.HrCode,
    up.FirstName + ' ' + up.LastName AS Name,
    cal.GtEpochYear AS [Year],
    cal.GtEpochWeek AS [Week],
    MIN(CONVERT(VARCHAR, d.Date, 103)) AS WeekStart,
    MAX(CONVERT(VARCHAR, d.Date, 103)) AS WeekEnd,
    'Approved' AS Source,
    CONVERT(VARCHAR(50), ct.ContractTypeName) AS ContractType,
    COUNT(*) AS ShiftCount
FROM Debrief d
JOIN Contractor c ON c.ContractorId = d.ContractorId
JOIN [User] u ON u.UserId = c.UserId
JOIN UserProfile up ON up.UserId = u.UserId
JOIN Calendar cal ON cal.Date = CAST(d.Date AS DATE)
JOIN ContractType ct ON ct.ContractTypeId = d.ContractTypeId
WHERE c.HrCode = @HrCode
  AND d.IsApproved = 1
  AND CAST(d.Date AS DATE) >= @StartDate
GROUP BY c.HrCode, up.FirstName, up.LastName,
         cal.GtEpochYear, cal.GtEpochWeek, ct.ContractTypeName
ORDER BY cal.GtEpochYear, cal.GtEpochWeek
```

**Part 2 — Current week rota projection since start_date:**
```sql
SELECT
    c.HrCode,
    up.FirstName + ' ' + up.LastName AS Name,
    cal.GtEpochYear AS [Year],
    cal.GtEpochWeek AS [Week],
    MIN(CONVERT(VARCHAR, r.Date, 103)) AS WeekStart,
    MAX(CONVERT(VARCHAR, r.Date, 103)) AS WeekEnd,
    'Rota (Projected)' AS Source,
    CONVERT(VARCHAR(50), ct.ContractTypeName) AS ContractType,
    COUNT(*) AS ShiftCount
FROM ContractorRota r
JOIN Contractor c ON c.ContractorId = r.ContractorId
JOIN [User] u ON u.UserId = c.UserId
JOIN UserProfile up ON up.UserId = u.UserId
JOIN Calendar cal ON cal.Date = CAST(r.Date AS DATE)
JOIN RotaActivity ra ON ra.RotaActivityId = r.RotaActivityId
JOIN ContractType ct ON ct.ContractTypeId = r.ContractTypeId
WHERE c.HrCode = @HrCode
  AND cal.GtEpochYear = @CurrentYear
  AND cal.GtEpochWeek = @CurrentWeek
  AND ra.IsNonWork = 0
  AND CAST(r.Date AS DATE) >= @StartDate
  AND NOT EXISTS (
    SELECT 1 FROM Debrief d
    WHERE d.ContractorId = r.ContractorId
      AND CAST(d.Date AS DATE) = CAST(r.Date AS DATE)
      AND d.IsApproved = 1
  )
GROUP BY c.HrCode, up.FirstName, up.LastName,
         cal.GtEpochYear, cal.GtEpochWeek, ct.ContractTypeName
```

**Current epoch lookup (run once per session):**
```sql
SELECT GtEpochYear, GtEpochWeek
FROM Calendar
WHERE Date = CAST(GETDATE() AS DATE)
```

**First rota entry lookup (discrepancy check):**
```sql
SELECT MIN(CAST(r.Date AS DATE)) AS FirstRotaDate
FROM ContractorRota r
JOIN Contractor c ON c.ContractorId = r.ContractorId
JOIN RotaActivity ra ON ra.RotaActivityId = r.RotaActivityId
WHERE c.HrCode = @HrCode
  AND ra.IsNonWork = 0
```

### CRITICAL: Greythorn Query Rules
- **Always `CAST(... AS DATE)`** when joining to `Calendar` — direct equality on date columns with time components returns zero rows silently
- **Always `CAST(numeric AS FLOAT)`** for any numeric column — silent empty results otherwise
- **Never `UNION ALL` with FLOAT columns** — run Part 1 and Part 2 as separate queries
- **Always quote `[User]`** — reserved word in SQL Server

---

## Build Phases — Execution Order

Work through these phases in order. Do not skip ahead. Confirm completion of each phase
with the user before proceeding to the next.

---

### PHASE 0 — Prerequisites Check

Before writing any code, verify the following with the user:

1. Confirm GitHub repo name and whether it is already cloned locally
2. Confirm Supabase project has been created and note the project URL
3. Confirm Vercel account is connected to GitHub
4. Check Node.js version (`node --version` — needs 18+)
5. Check Python version (`python --version` — needs 3.9+)
6. Install Supabase CLI if not present: `npm install -g supabase`
7. Collect from user: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (found in Supabase dashboard → Project Settings → API)

---

### PHASE 1 — Repository Initialisation

1. Scaffold the directory structure listed above
2. Create `.gitignore` (include `.env.local`, `__pycache__`, `.next`, `node_modules`)
3. Create `.env.example` with blank variable names
4. Create `.env.local` with values provided by user
5. Initialise Next.js: `npx create-next-app@latest . --typescript --app --tailwind --no-src-dir`
6. Install Supabase JS client: `npm install @supabase/supabase-js @supabase/ssr`
7. Create `lib/supabase.ts` and `lib/supabase-server.ts`
8. Commit and push to GitHub

---

### PHASE 2 — Database Schema

1. Write `supabase/migrations/001_initial_schema.sql` — full contents from the Schema section above
2. Walk user through applying the migration:
   - Option A (Supabase dashboard SQL editor): paste and run directly
   - Option B (Supabase CLI): `supabase db push`
3. Verify all four tables exist in the Supabase dashboard
4. Verify RLS is enabled on all tables
5. Verify the profile auto-creation trigger is active
6. Commit migration file

---

### PHASE 3 — Contractor Sync Script + Self-Hosted Runner

**Part A — Write the sync script:**
1. Write `scripts/contractor_sync.py` with full logic:
   - Connect to Greythorn via `pyodbc` using env vars
   - Run the sync query
   - Upsert to `contractors` table in Supabase
   - On success: write `{ status: 'success', records_synced: N, triggered_by: 'scheduled' }` to `sync_log`
   - On error: write `{ status: 'error', error_message: str(e), triggered_by: 'scheduled' }` to `sync_log`, then re-raise
   - Print summary to stdout
2. Create `scripts/.env` (gitignored) with Supabase and Greythorn credentials
3. Install dependencies: `pip install supabase pyodbc python-dotenv`
4. Test run locally: `python scripts/contractor_sync.py`
5. Verify contractors table populated in Supabase
6. Verify sync_log has a success row

**Part B — Self-hosted GitHub Actions runner (on work PC):**
1. In GitHub repo → Settings → Actions → Runners → New self-hosted runner
2. Select Windows, follow the setup instructions to download and configure the runner agent
3. When prompted for labels, use: `self-hosted`
4. Install runner as a Windows service (runs automatically on startup):
   ```powershell
   # Run from the runner directory as Administrator
   .\svc.sh install
   .\svc.sh start
   ```
5. Add all required GitHub Actions secrets (repo → Settings → Secrets → Actions):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GT_DB_SERVER`, `GT_DB_NAME`, `GT_DB_USER`, `GT_DB_PASSWORD`, `GT_DB_PORT`
6. Write `.github/workflows/contractor-sync.yml` (full content in Script section above)
7. Trigger a manual run from GitHub Actions tab (workflow_dispatch) to confirm it works end-to-end
8. Verify the runner picks up the job and completes it

**Part C — Windows sleep prevention:**
1. Open Task Scheduler → Create Basic Task
2. Name: "Greythorn Sync Wake"
3. Trigger: Daily, 10:55 AM
4. Action: Start a program → `powercfg` → Arguments: `/x -standby-timeout-ac 0`
5. This keeps the machine from sleeping in the window before the 11AM sync

**Phase 3 complete when:** Manual workflow dispatch runs successfully, contractors table populated, sync_log has a success row, runner shows as Idle in GitHub.

---

### PHASE 4 — Missed Sync Detection + Email Notification

**Purpose:** A Vercel cron job runs at 13:00 daily. If no successful sync entry exists in `sync_log` for today, it sends an email to all admin users.

**Step 1 — Install Resend:**
```bash
npm install resend
```

**Step 2 — Create `app/api/cron/check-sync/route.ts`:**

Logic:
1. Verify request includes `Authorization: Bearer {CRON_SECRET}` header — reject with 401 if not
2. Query `sync_log` for any row where `status = 'success'` and `ran_at` is today (UTC date)
3. If found → return `{ ok: true, message: 'Sync ran today' }`
4. If not found → send email via Resend to `NOTIFY_TO_EMAILS` and return `{ ok: true, message: 'Alert sent' }`

Email content:
- **Subject:** `⚠️ Greythorn Contractor Sync Did Not Run — Manual Action Required`
- **Body:** Plain text explaining the sync did not run at 11AM today, the contractors table may be up to 24 hours stale, and the operator should run `python scripts/contractor_sync.py` manually from any machine with Greythorn network access. Include today's date and time in the message.

**Step 3 — Create `vercel.json` in repo root:**
```json
{
  "crons": [
    {
      "path": "/api/cron/check-sync",
      "schedule": "0 13 * * *"
    }
  ]
}
```

**Step 4 — Add environment variables:**
- `RESEND_API_KEY`, `NOTIFY_TO_EMAILS`, `CRON_SECRET` must be in `.env.local` and Vercel dashboard
- `NOTIFY_FROM_EMAIL` is confirmed as `notifications@greythornservices.uk` (domain already verified in Resend)

**Step 5 — Add cron auth to the route:**
Vercel automatically adds `Authorization: Bearer {CRON_SECRET}` to cron requests when `CRON_SECRET` is set. Verify this is checked at the top of the route handler.

**Phase 4 complete when:** Cron route returns correct response when queried manually with the correct bearer token; Resend test email received.

---

### PHASE 5 — Frontend: Auth + Login

1. Build `app/login/page.tsx` — username/password login form
   - Label the field "Username" not "Email" — internally maps to `display_id@greythorn.internal` or `display_id@greythorn.external`
   - Calls `supabase.auth.signInWithPassword({ email: buildEmail(username), password })`
   - On success: redirect to `/referrals`
   - On error: inline error message
2. Build `middleware.ts` — protects `/referrals`, `/submit`, `/admin`; redirects unauthenticated users to `/login`
3. Test login with admin test user created in Phase 2
4. Commit

---

### PHASE 6 — Frontend: Referral Submission Form

1. Build `components/HrCodeInput.tsx`:
   - Start date must be entered first — show helper text until it is
   - Debounced validation (400ms) on HR code field calls `contractors` table via Supabase client
   - Auto-populates name field on valid HR code
   - Inline error states: not-found, inactive, REF-001 (duplicate), REF-002 (rehire)
2. Build `components/ReferralForm.tsx` — full submission form
3. Build `app/submit/page.tsx`
4. Catch Postgres error `23505` on insert → display REF-001 message
5. On success: redirect to `/referrals` with success toast
6. Test all validation paths
7. Commit

---

### PHASE 7 — Frontend: Recruiter Portal

1. Build `components/ReferralTable.tsx`
2. Build `app/referrals/page.tsx`
3. Status badges: Pending (grey) / Not Yet Eligible (amber) / Approved (green)
4. Dates formatted DD/MM/YYYY
5. Empty state: "You have no referrals registered yet."
6. "Register New Referral" button → `/submit`
7. Commit

---

### PHASE 8 — Frontend: Admin Dashboard

1. Build `app/admin/page.tsx`:
   - Server-side check: if `profiles.is_admin = false` → redirect to `/referrals`
   - Show **SyncStatusBanner** at the top of the page:
     - Queries `sync_log` for most recent successful row
     - If today: green banner — "Contractor sync completed today at HH:MM"
     - If yesterday or older: amber banner — "Last sync: DD/MM/YYYY HH:MM — contractors table may be stale"
     - If no rows ever: red banner — "No sync has ever run"
2. Build `components/SyncStatusBanner.tsx`
3. Build `components/AdminTable.tsx` — all referrals, all recruiters, expandable rows
4. Inline edit for `approval_notes`; status override
5. All admin writes via server action using service role key
6. Commit

---

### PHASE 9 — Admin User Provisioning Page

1. Build `app/admin/users/page.tsx`:
   - List all users (from `profiles` table via service role)
   - Create user form: Display ID, Internal/External toggle, temporary password
   - On submit: calls server action that uses `supabase.auth.admin.createUser()`
   - Email set as: `display_id@greythorn.internal` (internal) or `display_id@greythorn.external` (external)
   - Profile row inserted via trigger (from Phase 2 schema)
2. Commit

---

### PHASE 10 — Referral Check Script

1. Write `scripts/referral_check.py` using the full process flow documented above
2. Test against a known contractor HR code with an existing referral in Supabase
3. Verify `referral_checks` row written correctly
4. Verify `referrals` row updated correctly
5. Verify `check_detail` JSONB structure matches specification
6. Commit

---

### PHASE 11 — Vercel Deployment

1. Connect Vercel project to GitHub repo (if not already done)
2. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `NOTIFY_TO_EMAILS`, `CRON_SECRET`
3. Deploy and test production build
4. Confirm Vercel cron is registered (Vercel dashboard → project → Cron Jobs tab)
5. Verify login, referral submission, recruiter portal, and admin dashboard all work on production URL
6. Update Supabase Auth → Site URL to the production Vercel URL

**Phase 11 complete when:** Production URL is live, cron is active, all flows tested end-to-end.

---

## Working Style Notes

- After each phase is complete, summarise what was built and what comes next
- If any step requires a decision from the user, stop and ask before proceeding
- If a Greythorn query produces unexpected results, check the CRITICAL rules section above first
- All dates displayed to users in DD/MM/YYYY format (UK locale)
- British English throughout all user-facing text
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser-side code — server actions only

---

## Greythorn Database Access — Architecture Summary

| Script | Where it runs | How it connects to Greythorn |
|---|---|---|
| `contractor_sync.py` | Work PC (via GitHub Actions self-hosted runner) | Direct `pyodbc` SQL Server connection |
| `referral_check.py` | Any machine with Greythorn network access (Claude Code or terminal) | Direct `pyodbc` SQL Server connection |

Neither script can run from Vercel or GitHub's cloud runners — they require direct network access to the Greythorn SQL Server.

The `mssql:execute_sql` MCP tool (available inside Claude Code sessions) is an alternative way to run Greythorn queries interactively for development, debugging, and ad-hoc lookups. It does not replace the Python scripts for automated or scheduled use.

Full schema reference and query patterns are documented in:
`/mnt/skills/user/greythorn-db/SKILL.md` (available inside Claude Code sessions).

Key rules repeated here for emphasis:
- `CAST(numeric AS FLOAT)` on every numeric column — silent failures otherwise
- `CAST(date_column AS DATE)` before Calendar joins — time component breaks equality
- Never `UNION ALL` with FLOAT output columns — run as separate queries
- Always quote `[User]` — SQL Server reserved word

---

## Current State (as of 15 March 2026)

### Build Status — ALL PHASES COMPLETE

| Phase | Status | Notes |
|---|---|---|
| 0 — Prerequisites | Done | Node 23.7, Python 3.14, Supabase CLI 2.75 |
| 1 — Repo Init | Done | Next.js 16, Supabase SSR, TypeScript |
| 2 — Database Schema | Done | All tables, RLS, trigger (with `SET search_path = public` fix) |
| 3A — Contractor Sync | Done | Uses `ContractorAccountStatusHistory` for active/inactive |
| 3B — Self-hosted Runner | Parked | Not on work PC — sync runs manually for now |
| 3C — Windows Sleep | Parked | Dependent on 3B |
| 4 — Missed Sync Cron | Done | Vercel cron at 13:00 UTC |
| 5 — Auth + Login | Done | Username maps to internal/external email domains |
| 6 — Referral Submission | Done | REF-001, REF-002, REF-003 validation |
| 7 — Recruiter Portal | Done | My Referrals with sortable table + HR code search |
| 8 — Admin Dashboard | Done | All referrals, expandable check detail, inline edit, reset |
| 9 — User Provisioning | Done | Create users via admin page |
| 10 — Referral Check Script | Done | With email summary via Resend |
| 11 — Vercel Deployment | Done | Live at www.gsapps.co |

### Production URLs & Services

- **App:** https://www.gsapps.co (custom domain on Vercel)
- **Supabase:** https://fjhkowrxuczkrafczcru.supabase.co
- **GitHub:** https://github.com/w0rkar0und/gs_referrals
- **Resend sender domain:** greythornservices.uk
- **Admin email:** miten@greythorn.services

### Vercel Cron Jobs (4 active)

| Schedule | Path | Purpose |
|---|---|---|
| 10:30 daily | `/api/cron/sync-reminder` | Email reminder to run contractor sync |
| 13:00 daily | `/api/cron/check-sync` | Alert if sync hasn't run today |
| 23:05 daily | `/api/cron/referral-digest` | Daily digest of new referral submissions |

### Email Notifications

| Trigger | Source | Recipients |
|---|---|---|
| Sync reminder (10:30) | Vercel cron | NOTIFY_TO_EMAILS |
| Missed sync alert (13:00) | Vercel cron | NOTIFY_TO_EMAILS |
| Referral check results | `referral_check.py` | NOTIFY_TO_EMAILS in scripts/.env |
| New referrals digest (23:05) | Vercel cron | NOTIFY_TO_EMAILS |

### Users Seeded

- **Admin:** m.patel (external, password: Goodbye36, is_admin: true)
- **12 recruiter accounts** created from 2025 Referrals spreadsheet (all internal, password: Greythorn2026)
- **165 referrals** seeded from `seed_data/2025 Referrals.xlsx`
- **3,439 contractors** synced from Greythorn

### Error Codes

| Code | Check | Location |
|---|---|---|
| REF-001 | Duplicate HR code | HrCodeInput (checked before REF-002) |
| REF-002 | Rehire within 6 months | HrCodeInput |
| REF-003 | Start date >7 days in past | ReferralForm |

### Key Technical Decisions & Fixes Made During Build

1. **Active/inactive status** uses `ContractorAccountStatusHistory.Active` (not `CurrentRecruitmentStatusId`). A contractor can be "Hired" but deactivated at account level.
2. **Status change date** (`status_changed_at`) comes from `ContractorAccountStatusHistory.CreatedAt`. Contractors with no history default to active with no date.
3. **ODBC Driver 18** used on Mac (not 17 as in original spec).
4. **Profile trigger** required `SET search_path = public` to work correctly.
5. **REF-001 duplicate check** runs during HR code validation (not just on insert), and before REF-002.
6. **Authenticated pages** use `(authenticated)` route group for shared navbar layout.
7. **`ContractorAccountStatusHistory`** — contractors with no entries default to `COALESCE(acct.Active, 1)` (active).
8. **Greythorn DB is Azure SQL** (`greythorn.database.windows.net`) — accessible from any internet-connected machine, not just work PC.

### Route Structure

```
/                          → Redirects to /login or /referrals
/login                     → Username/password login
/(authenticated)/
  referrals/               → My Referrals (recruiter view)
  submit/                  → New referral form
  admin/                   → Admin dashboard (all referrals, expandable details)
  admin/checks/            → Run Checks (sync + check commands, selectable table)
  admin/users/             → User provisioning
  api/admin/update-referral → Admin referral updates (service role)
  api/admin/create-user    → Admin user creation (service role)
/api/cron/sync-reminder    → Daily sync reminder email
/api/cron/check-sync       → Missed sync detection + alert
/api/cron/referral-digest  → Daily new referrals digest
```

### UI Features Added Beyond Original Spec

- Sortable columns on all tables (click header to toggle asc/desc)
- HR code search on all tables
- Expandable check detail view (working day breakdown by week)
- Reset button to clear check data and revert to pending
- Qwylo Status column (Active/Inactive from Greythorn with status change date)
- Modern UI design (slate palette, rounded cards, sticky navbar, focus rings)
- Navbar with admin-only links (Dashboard, Run Checks, Users)
- Sign out + user avatar in navbar
- Run Checks page with numbered copy-paste commands (sync → check all → check selected)
- Check run email summary (approved/not yet eligible/skipped/errors)

---

*End of CLAUDE.md*
