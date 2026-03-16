# CLAUDE.md — GS Apps Platform
## Claude Code Project Briefing

This file is the authoritative briefing document for the GS Apps platform — a multi-application
hub for Greythorn Services. Read it fully before taking any action. All architectural decisions
documented here are final unless explicitly overridden by the user in the current session.

---

## Platform Overview

GS Apps (gsapps.co) is a multi-application platform for Greythorn Services operations.
Users log in once and see an app launcher showing only the applications they are authorised to access.
Platform admins (`profiles.is_admin = true`) can access all apps and manage user permissions.

### Current Apps

| App | Slug | Status | Description |
|---|---|---|---|
| Referrals | `referrals` | Live | Contractor referral registration and verification |

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | Hosted on Vercel |
| Database + Auth | Supabase (Postgres) | Row Level Security enforced |
| Repository | GitHub (`gs_apps`) | https://github.com/w0rkar0und/gs_apps |
| Sync/Check Scripts | Python 3.9+ | Run locally or via self-hosted GitHub Actions runner |
| Greythorn DB | Azure SQL Server | Accessed via pyodbc in Python scripts |
| Cron | Vercel cron | Daily sync reminder, missed sync check, referral digest |
| Email notifications | Resend | Verified sender domain: greythornservices.uk |

---

## Repository Structure

```
gs_apps/
├── .github/
│   └── workflows/
│       └── contractor-sync.yml          # Self-hosted runner — 11AM daily
├── app/                                 # Next.js App Router
│   ├── layout.tsx                       # Root layout — "GS Apps" title
│   ├── page.tsx                         # Redirects to /apps or /login
│   ├── login/
│   │   └── page.tsx                     # Username/password login
│   ├── (authenticated)/                 # Route group — shared navbar layout
│   │   ├── layout.tsx                   # AuthNavbar wrapper
│   │   ├── apps/
│   │   │   └── page.tsx                 # App launcher — shows authorised apps
│   │   ├── referrals/                   # ── Referrals app ──
│   │   │   ├── page.tsx                 # My Referrals (recruiter view)
│   │   │   ├── submit/
│   │   │   │   └── page.tsx             # New referral form
│   │   │   └── admin/
│   │   │       ├── page.tsx             # Admin dashboard
│   │   │       ├── checks/
│   │   │       │   ├── page.tsx         # Run Checks
│   │   │       │   └── ChecksPanel.tsx
│   │   │       └── users/
│   │   │           ├── page.tsx         # User provisioning
│   │   │           └── UserManagement.tsx
│   │   └── api/
│   │       └── referrals/
│   │           └── admin/
│   │               ├── create-user/route.ts
│   │               └── update-referral/route.ts
│   └── api/
│       └── cron/                        # Vercel cron endpoints (platform-level)
│           ├── sync-reminder/route.ts
│           ├── check-sync/route.ts
│           └── referral-digest/route.ts
├── components/
│   ├── AuthNavbar.tsx                   # Platform — server component, fetches profile
│   ├── Navbar.tsx                       # Platform — multi-app aware, dynamic nav links
│   └── referrals/                       # ── Referrals app components ──
│       ├── AdminTable.tsx
│       ├── CheckDetailView.tsx
│       ├── HrCodeInput.tsx
│       ├── ReferralForm.tsx
│       ├── ReferralTable.tsx
│       ├── SearchInput.tsx
│       ├── SortableHeader.tsx
│       └── SyncStatusBanner.tsx
├── lib/
│   ├── apps.ts                          # App registry — add new apps here
│   ├── app-nav.ts                       # Per-app navigation links
│   ├── supabase.ts                      # Supabase client (browser)
│   ├── supabase-server.ts               # Supabase client (server/RSC)
│   └── types.ts                         # Shared TypeScript types
├── scripts/
│   ├── contractor_sync.py               # Greythorn → Supabase contractor sync
│   └── referral_check.py                # Working day verification
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql       # Core tables, RLS, triggers
│       └── 002_user_apps.sql            # Multi-app user access table
├── seed_data/                           # Historical data imports
├── vercel.json                          # Vercel cron schedule
├── next.config.ts                       # Redirects for old URLs
├── .env.example
├── .env.local
├── .gitignore
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

---

## Multi-App Architecture

### How to add a new app

1. **Register the app** — add an entry to `lib/apps.ts`:
   ```typescript
   {
     slug: 'new-app',
     name: 'New App',
     description: 'What it does',
     icon: 'generic',    // add a new icon key to the launcher if needed
     basePath: '/new-app',
   }
   ```

2. **Add nav links** — add an entry to `lib/app-nav.ts`:
   ```typescript
   'new-app': [
     { href: '/new-app', label: 'Home', adminOnly: false },
     { href: '/new-app/settings', label: 'Settings', adminOnly: true },
   ]
   ```

3. **Update middleware matcher** — add the base path to `middleware.ts`:
   ```typescript
   export const config = {
     matcher: ['/apps/:path*', '/referrals/:path*', '/new-app/:path*'],
   }
   ```

4. **Create routes** — build pages under `app/(authenticated)/new-app/`

5. **Create components** — add to `components/new-app/`

6. **Grant access** — insert rows into `user_apps` for authorised users

### App access control

- **`user_apps` table** maps users to apps via `(user_id, app_slug)` pairs
- **Platform admins** (`profiles.is_admin = true`) bypass `user_apps` and can access all apps
- **Middleware** checks `user_apps` on every request to an app route; unauthorised users redirect to `/apps`
- **App launcher** (`/apps`) only shows apps the user has access to
- **New users** created via the admin page get app access granted automatically (defaults to `referrals`)

### Navbar behaviour

- Logo links to `/apps` (the launcher)
- Shows the current app name next to the logo
- Nav links are contextual — driven by `lib/app-nav.ts` based on the current URL path
- On the `/apps` launcher page, no app-specific nav links are shown

---

## Database Schema

### Platform tables

#### Table: `profiles`
Extends Supabase `auth.users`. Created automatically on user signup via trigger.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,          -- HR code (X######) or j.smith for external
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,   -- Platform-wide admin flag
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`is_admin` is a **platform-level superadmin flag** — admins can access all apps and all admin features.

#### Table: `user_apps`
Maps users to the apps they can access. Admins bypass this check.

```sql
CREATE TABLE user_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_slug TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, app_slug)
);
```

### Referrals app tables

#### Table: `contractors`
Synced daily from Greythorn. Source of truth for HR code validation.

```sql
CREATE TABLE contractors (
  hr_code TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_worked_date DATE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Table: `referrals`
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

#### Table: `referral_checks`
Full audit trail of every working-day verification.

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

#### Table: `sync_log`
One row per contractor sync attempt. Used by missed-sync cron.

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

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_apps ENABLE ROW LEVEL SECURITY;

-- profiles: users read/update their own row only
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- user_apps: users can read their own app assignments
CREATE POLICY "user_apps_select_own" ON user_apps FOR SELECT USING (auth.uid() = user_id);

-- contractors: all authenticated users can read
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

-- Admin bypass: service role key bypasses RLS entirely.
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

## Route Structure

```
/                              → Redirects to /apps or /login
/login                         → Username/password login
/(authenticated)/
  apps/                        → App launcher (shows authorised apps)
  referrals/                   → My Referrals (recruiter view)
  referrals/submit/            → New referral form
  referrals/admin/             → Admin dashboard (all referrals)
  referrals/admin/checks/      → Run Checks
  referrals/admin/users/       → User provisioning
  api/referrals/admin/update-referral → Admin referral updates (service role)
  api/referrals/admin/create-user    → Admin user creation (service role)
/api/cron/sync-reminder        → Daily sync reminder email
/api/cron/check-sync           → Missed sync detection + alert
/api/cron/referral-digest      → Daily new referrals digest
```

### URL redirects (for old bookmarks)
Configured in `next.config.ts`:
- `/submit` → `/referrals/submit`
- `/admin` → `/referrals/admin`
- `/admin/*` → `/referrals/admin/*`

---

## Environment Variables

### `.env.example` (committed — empty values only)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=
NOTIFY_TO_EMAILS=
CRON_SECRET=
```

### Python scripts — `scripts/.env` (never commit)
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GT_DB_SERVER=
GT_DB_NAME=
GT_DB_USER=
GT_DB_PASSWORD=
GT_DB_PORT=1433
```

---

## Referrals App — Detailed Documentation

### Error Codes

| Code | Trigger | User-Facing Message |
|---|---|---|
| `REF-001` | Duplicate HR code | "This HR code has already been registered by another user. If you believe this is an error, please contact SLT quoting reference REF-001." |
| `REF-002` | Rehire within 6 months | "This contractor's last recorded working day falls within six months of the submitted start date. This referral cannot be accepted. If you believe this is an error, please contact SLT quoting reference REF-002." |
| `REF-003` | Start date >7 days in past | "Referrals cannot be backdated beyond 7 days. If you believe this is an error, please contact SLT quoting reference REF-003." |

### HR Code Validation Flow

On the `HrCodeInput` component (debounced 400ms):
1. Query `contractors` table by HR code
2. If not found → inline error
3. If `is_active = false` → inline error
4. If active → auto-populate name, run REF-001 (duplicate) and REF-002 (rehire 180-day) checks
5. On submit → Supabase insert → catch `23505` → REF-001

### Python Script: `contractor_sync.py`

Queries Greythorn → upserts to Supabase `contractors` table → writes to `sync_log`.

### Python Script: `referral_check.py`

For a given HR code (or list), checks working days against Greythorn since the referral
start date, compares against 30-day threshold, writes results to Supabase.

Query version: `v1.0`. Half-day rule applies to: `NL 1%`, `NL 2%`, `NL 3%`, `Nursery 1%`, `Nursery 2%`, `Nursery L1%`, `Nursery L2%`, `Nursery L3%`.

### CRITICAL: Greythorn Query Rules
- **Always `CAST(... AS DATE)`** when joining to `Calendar`
- **Always `CAST(numeric AS FLOAT)`** for any numeric column
- **Never `UNION ALL` with FLOAT columns** — run as separate queries
- **Always quote `[User]`** — SQL Server reserved word

---

## Vercel Cron Jobs

| Schedule | Path | Purpose |
|---|---|---|
| 10:30 daily | `/api/cron/sync-reminder` | Email reminder to run contractor sync |
| 13:00 daily | `/api/cron/check-sync` | Alert if sync hasn't run today |
| 23:05 daily | `/api/cron/referral-digest` | Daily digest of new referral submissions |

---

## Production URLs & Services

- **App:** https://www.gsapps.co
- **Supabase:** https://fjhkowrxuczkrafczcru.supabase.co
- **GitHub:** https://github.com/w0rkar0und/gs_apps
- **Resend sender domain:** greythornservices.uk
- **Admin email:** miten@greythorn.services

---

## Current State (as of 16 March 2026)

### Referrals App — Fully Built

All 11 original build phases complete. Referrals app is live at `/referrals/*`.

### Multi-App Platform — Implemented, Not Yet Pushed

- App launcher at `/apps` with card-based UI
- `user_apps` table for per-app access control (migration applied to Supabase)
- Middleware enforces per-app authorisation
- Navbar is multi-app aware with contextual navigation
- Components namespaced under `components/referrals/`
- All referral routes moved under `/referrals/` prefix
- Old URLs redirected via `next.config.ts`
- Repo renamed to `gs_apps` on GitHub, Vercel, and Supabase
- **Next step:** Rename local directory from `gs_referrals` to `gs_apps`, then push all changes to GitHub

### Users

- **Admin:** m.patel (external, is_admin: true) — platform superadmin
- **12 recruiter accounts** — internal, granted `referrals` app access
- **165 referrals** seeded from 2025 data
- **3,440 contractors** synced from Greythorn

### Key Technical Decisions

1. **Active/inactive status** uses `ContractorAccountStatusHistory.Active` (not `CurrentRecruitmentStatusId`)
2. **Status change date** from `ContractorAccountStatusHistory.CreatedAt`
3. **ODBC Driver 18** on Mac
4. **Profile trigger** requires `SET search_path = public`
5. **REF-001 duplicate check** runs during HR code validation, before REF-002
6. **Greythorn DB is Azure SQL** — accessible from any internet-connected machine
7. **`is_admin` on profiles** is platform-wide superadmin — admins bypass all app access checks
8. **`user_apps` table** gates per-user app access; middleware checks on every request

---

## Working Style Notes

- British English throughout all user-facing text
- All dates displayed DD/MM/YYYY (UK locale)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser-side code
- If a Greythorn query produces unexpected results, check the CRITICAL rules section first
- When adding a new app, follow the "How to add a new app" checklist above

---

*End of CLAUDE.md*
