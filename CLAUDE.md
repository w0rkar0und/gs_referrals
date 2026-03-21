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
| Reports | `reports` | Live | Self-service Greythorn SQL Server reports with visualisations |

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | Hosted on Vercel |
| Database + Auth | Supabase (Postgres) | Row Level Security enforced |
| Repository | GitHub (`gs_apps`) | https://github.com/w0rkar0und/gs_apps |
| Sync/Check Scripts | Python 3.9+ | Run locally or via self-hosted GitHub Actions runner |
| Greythorn DB | Azure SQL Server | Accessed via Railway proxy (static IP) |
| SQL Proxy | Railway (Pro plan) | Node.js/Express — static outbound IP for SQL Server whitelist |
| Cron | Vercel cron | Daily sync reminder, missed sync check, referral digest |
| Email notifications | Resend | Verified sender domain: greythornservices.uk |
| Charts | Recharts | Used in Reports app for data visualisation |
| Excel generation | ExcelJS | House-style .xlsx reports |

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
│   │   │   ├── page.tsx                 # App launcher — shows authorised apps
│   │   │   └── admin/
│   │   │       └── page.tsx             # Platform user management (admin only)
│   │   ├── referrals/                   # ── Referrals app ──
│   │   │   ├── page.tsx                 # My Referrals (recruiter view)
│   │   │   ├── submit/
│   │   │   │   └── page.tsx             # New referral form
│   │   │   └── admin/
│   │   │       ├── page.tsx             # Admin dashboard
│   │   │       ├── checks/
│   │   │       │   ├── page.tsx         # Run Checks
│   │   │       │   └── ChecksPanel.tsx
│   │   ├── reports/                     # ── Reports app ──
│   │   │   └── page.tsx                 # Report runner (server component, checks permissions)
│   │   └── api/
│   │       ├── platform/admin/
│   │       │   ├── create-user/route.ts # Platform user creation (service role)
│   │       │   └── update-user/route.ts # Platform user edit/deactivate/delete
│   │       ├── referrals/admin/
│   │       │   └── update-referral/route.ts
│   │       └── reports/
│   │           ├── deposit/route.ts             # Proxy → Railway deposit report
│   │           ├── working-days/route.ts        # Proxy → Railway working days report
│   │           ├── working-days-by-client/route.ts  # Proxy → Railway fleet-wide report
│   │           ├── settlement/route.ts          # Proxy → Railway settlement report
│   │           ├── download/route.ts            # ExcelJS generation → .xlsx download
│   │           └── email/route.ts               # ExcelJS generation → Resend email
│   └── api/
│       └── cron/                        # Vercel cron endpoints (platform-level)
│           ├── sync-reminder/route.ts
│           ├── check-sync/route.ts
│           └── referral-digest/route.ts
├── components/
│   ├── AuthNavbar.tsx                   # Platform — server component, fetches profile
│   ├── Navbar.tsx                       # Platform — multi-app aware, hamburger menu on mobile
│   ├── platform/                        # ── Platform components ──
│   │   └── PlatformUserManagement.tsx   # Admin user management (create/edit/deactivate/delete)
│   ├── referrals/                       # ── Referrals app components ──
│   │   ├── AdminTable.tsx
│   │   ├── CheckDetailView.tsx
│   │   ├── HrCodeInput.tsx
│   │   ├── ReferralForm.tsx
│   │   ├── ReferralTable.tsx             # Desktop table + mobile card layout
│   │   ├── SearchInput.tsx
│   │   ├── SortableHeader.tsx
│   │   ├── SuccessToast.tsx              # Auto-dismissing success banner
│   │   └── SyncStatusBanner.tsx
│   └── reports/                         # ── Reports app components ──
│       ├── ReportRunner.tsx             # Report selector, download/email actions
│       ├── DepositReport.tsx            # Deposit report — 4-section table view
│       ├── WorkingDaysReport.tsx        # Per-contractor working day count
│       ├── WorkingDaysByClientReport.tsx # Fleet-wide: filters, chart, grouped table
│       └── SettlementReport.tsx         # DA Relations settlement — 5 collapsible sections
├── docs/
│   ├── GREYTHORN_REPORTS_CONTEXT.md     # Full report specs (deposit + working days)
│   ├── WORKING_DAY_COUNT_BY_CLIENT.md   # Fleet-wide report spec + SQL
│   ├── REFERRALS_USER_GUIDE.md          # Referrals app user guide (plain English)
│   └── Referrals_User_Guide.pdf         # PDF version of the user guide
├── lib/
│   ├── apps.ts                          # App registry — add new apps here
│   ├── app-nav.ts                       # Per-app navigation links
│   ├── excel-styles.ts                  # ExcelJS house style definitions
│   ├── excel-deposit.ts                 # Deposit report Excel generator
│   ├── excel-working-days.ts            # Working day count Excel generator
│   ├── excel-working-days-by-client.ts  # Fleet-wide report Excel generator
│   ├── excel-settlement.ts             # Settlement report Excel generator
│   ├── supabase.ts                      # Supabase client (browser)
│   ├── supabase-server.ts               # Supabase client (server/RSC)
│   └── types.ts                         # Shared TypeScript types
├── railway-proxy/                       # ── Railway SQL proxy service ──
│   ├── index.js                         # Express server — report query endpoints
│   ├── package.json
│   └── .gitignore
├── scripts/
│   ├── contractor_sync.py               # Greythorn → Supabase contractor sync
│   ├── referral_check.py                # Working day verification
│   └── generate_referrals_guide_pdf.py  # Regenerate Referrals_User_Guide.pdf
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql       # Core tables, RLS, triggers
│       ├── 002_user_apps.sql            # Multi-app user access table
│       ├── 003_profile_fields.sql       # Add full_name, email, is_active to profiles
│       └── 004_user_apps_permissions.sql # Add permissions JSONB to user_apps
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
     matcher: ['/apps/:path*', '/referrals/:path*', '/reports/:path*', '/new-app/:path*'],
   }
   ```

4. **Create routes** — build pages under `app/(authenticated)/new-app/`

5. **Create components** — add to `components/new-app/`

6. **Grant access** — insert rows into `user_apps` for authorised users

### App access control

- **`user_apps` table** maps users to apps via `(user_id, app_slug)` pairs
- **`permissions` JSONB column** on `user_apps` provides sub-level access control (e.g. per-report-type)
- **Platform admins** (`profiles.is_admin = true`) bypass `user_apps` and can access all apps
- **Middleware** checks `user_apps` on every request to an app route; unauthorised users redirect to `/apps`
- **App launcher** (`/apps`) only shows apps the user has access to
- **New users** created via the admin page get app access granted automatically (defaults to `referrals`)

### Navbar behaviour

- Logo links to `/apps` (the launcher)
- Shows the current app name next to the logo
- Nav links are contextual — driven by `lib/app-nav.ts` based on the current URL path
- On the `/apps` launcher page, admins see "Users & Access" link
- All forms have `autoComplete="off"` to prevent browser value retention

---

## Database Schema

### Platform tables

#### Table: `profiles`
Extends Supabase `auth.users`. Created automatically on user signup via trigger.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,          -- HR code (X######) or j.smith for external
  full_name TEXT,                    -- User's full name
  email TEXT,                        -- User's real email address
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,   -- Platform-wide admin flag
  is_active BOOLEAN NOT NULL DEFAULT TRUE,   -- Deactivated users cannot log in
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`is_admin` is a **platform-level superadmin flag** — admins can access all apps and all admin features.

**Note:** `is_active` may be `null` for users created before migration 003. Frontend code uses `=== false` checks to treat `null` as active.

#### Table: `user_apps`
Maps users to the apps they can access. Admins bypass this check.

```sql
CREATE TABLE user_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_slug TEXT NOT NULL,
  permissions JSONB,                 -- Sub-level permissions (e.g. {"deposit": true, "working-days": true})
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, app_slug)
);
```

**Permissions JSONB** — used by apps that need sub-level access control. For the Reports app:
```json
{"deposit": true, "working-days": true, "working-days-by-client": true}
```
The `APP_PERMISSIONS` config in `PlatformUserManagement.tsx` defines which apps have sub-permissions and what the keys are.

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
  INSERT INTO profiles (id, display_id, full_name, email, is_internal, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_id', NEW.email),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'email',
    COALESCE((NEW.raw_user_meta_data->>'is_internal')::boolean, true),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

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
  apps/admin/                  → Platform user management (admin only)
  referrals/                   → My Referrals (recruiter view)
  referrals/submit/            → New referral form
  referrals/admin/             → Admin dashboard (all referrals)
  referrals/admin/checks/      → Run Checks
  reports/                     → Report runner (all report types)
  api/platform/admin/create-user     → Platform user creation (service role)
  api/platform/admin/update-user     → Platform user edit/deactivate/delete (service role)
  api/referrals/admin/update-referral → Admin referral updates (service role)
  api/reports/deposit                → Deposit report proxy
  api/reports/working-days           → Working day count proxy
  api/reports/working-days-by-client → Fleet-wide report proxy
  api/reports/settlement             → Settlement report proxy
  api/reports/download               → Excel download for any report type
  api/reports/email                  → Email report to user's own email
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

### Vercel (Next.js)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=
NOTIFY_TO_EMAILS=
CRON_SECRET=
RAILWAY_PROXY_URL=https://gsapps-production.up.railway.app
RAILWAY_PROXY_SECRET=<shared secret>
```

### Railway (SQL proxy)
```
MSSQL_HOST=
MSSQL_PORT=1433
MSSQL_USER=
MSSQL_PASSWORD=
MSSQL_DATABASE=
PROXY_SECRET=<same shared secret>
PORT=3000
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

## Railway SQL Proxy

### Overview
A Node.js/Express service deployed on Railway with static outbound IPs, used to proxy SQL Server queries from Vercel (which has no static IP).

- **Public URL:** `https://gsapps-production.up.railway.app`
- **Health check:** `GET /health` → `{ status: 'ok', database: 'connected' }`
- **Auth:** `X-Report-Secret` header validated on all `/report/*` endpoints
- **Root directory:** `railway-proxy/` within the `gs_apps` repo
- **Static outbound IP:** whitelisted on Greythorn Azure SQL Server firewall

### Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/health` | — | DB connectivity check (no auth) |
| POST | `/report/deposit` | `{ hrCode }` | Deposit report — 4 section queries |
| POST | `/report/working-days` | `{ hrCode }` | Per-contractor working day count |
| POST | `/report/working-days-by-client` | `{}` | Fleet-wide weighted days by client/branch/contract type |
| POST | `/report/settlement` | `{ hrCode }` | DA Relations settlement — deposit, vehicles, charges, remittances |

### Request flow
```
Browser → Vercel API route (JWT auth + permission check)
       → Railway proxy (X-Report-Secret header)
       → SQL Server (Greythorn)
       → JSON back through the chain
```

---

## Reports App — Detailed Documentation

### Architecture

Reports follow a consistent pattern:
1. **Railway proxy** runs the SQL query and returns JSON
2. **Vercel API route** authenticates the user, checks permissions, proxies to Railway
3. **ReportRunner** client component handles form, download, and email actions
4. **Report component** renders the in-browser preview (tables + charts)
5. **Excel generator** produces house-style .xlsx for download/email

### Report Types

| Slug | Name | HR Code Required | Description |
|---|---|---|---|
| `deposit` | Deposit Report | Yes | 4-section deposit summary per contractor |
| `working-days` | Contractor - Working Day Count | Yes | Per-contractor weekly working day count |
| `working-days-by-client` | Working Days by Client | No | Fleet-wide weighted days with visualisations |
| `settlement` | DA Relations Settlement Data | Yes | 5-section settlement summary with collapsible sections |

### Access Control

Report access is controlled at two levels:
1. **App level** — user must have `reports` in `user_apps`
2. **Report level** — `permissions` JSONB on the `user_apps` row specifies which report types are allowed

Admins bypass both levels.

### Deposit Report (5 collapsible sections)
- Per-contractor deposit summary with 5 collapsible sections (chevron toggle, open by default) — same pattern as Settlement report
- **Section 1: Last Deposit Record** — latest `ContractorVehicleDeposit` with audit trail (created/updated/cancelled by)
- **Section 2: Deposit Instalment Payments** — transactions on the last deposit, with totals summary. Collapsed header shows weeks paid + remaining
- **Section 3: Vehicle Usage History** — all vehicles, non-Greythorn in italic grey. Collapsed header shows vehicle count + Greythorn count
- **Section 4: Vehicle Charges** — Greythorn vehicles only, with payment status and totals. Collapsed header shows partial paid count, unpaid count, total outstanding
- **Section 5: Deposit Return Audit** — ContractorAdditionalPay where reason = 7. Collapsed header shows return count + total amount
- **Split query pattern**: Part 1A isolates deposit ID lookup (no JOINs) to avoid SQL Server bit+JOIN silent failure, Part 1B fetches full details by PK
- Response shape: `{ contractor, deposit, transactions, vehicles, charges, depositReturns }`

### Contractor - Working Day Count
- Per-contractor, per-week summary from approved debriefs + current-week rota projections
- Two separate queries (never UNION ALL with FLOAT)
- Half-day rule for nursery contracts applied in presentation layer

### Working Days by Client
- Fleet-wide: no HR code input, scans all approved debriefs
- Targets the **last completed** Greythorn epoch week (not current)
- Three weight tiers in SQL: OSM/Support = 0.0, Sameday_6* = 0.5, else = 1.0
- Includes `BranchAlias` for display and filtering
- **Visualisations:** filter bar (Client, Branch, Contract Type) + Recharts bar chart that drills down + grouped data table

### DA Relations Settlement Data
- Per-contractor settlement summary with 5 collapsible sections (chevron toggle, open by default)
- **Section 1: Last Deposit Record** — latest `ContractorVehicleDeposit` with audit trail (created/updated/cancelled by)
- **Section 2: Deposit Instalment Payments** — transactions on the last deposit, with totals summary. Collapsed header shows weeks paid + remaining
- **Section 3: Vehicles Assigned** — all vehicles since the deposit creation date. Uses `VehicleOwnershipType.IsOwnedByContractor` to determine DA vs non-DA supplied. Non-DA supplied (contractor-owned, `IsOwnedByContractor !== '1'`) shown in italic grey. Collapsed header shows Greythorn vehicle count
- **Section 4: Vehicle Charges** — Greythorn vehicles only, with payment status and totals. Collapsed header shows partial paid count, unpaid count, total outstanding
- **Section 5: Recent Remittance Notices** — last 2 remittance notices
- **Contractor header** shows account status (active/deactivated) from `ContractorAccountStatusHistory`
- **Split query pattern**: Part 1A isolates deposit ID lookup (no JOINs) to avoid SQL Server bit+JOIN silent failure, Part 1B fetches full details by PK
- **Vehicle ownership**: `VehicleOwnershipType` table joined via `Vehicle.VehicleOwnershipTypeId`. `IsOwnedByContractor = 1` = DA supplied (contractor's own vehicle). `IsOwnedByContractor != 1` = Greythorn/company vehicle (italic grey)
- Response shape: `{ contractor, accountStatus, deposit, transactions, vehicles, charges, remittances }`

### Excel House Style

| Element | Style |
|---|---|
| Title row | Dark navy (`#1F3864`), white bold text |
| Column headers | Dark navy (`#1F3864`), white bold text |
| Section banners | Mid-blue (`#2E75B6`), white bold text |
| Alternating data rows | White / light blue (`#DEEAF1`) |
| Nil-record notices | Amber (`#FFD966`), italic |
| Summary/total rows | Green (`#E2EFDA`), bold |
| Non-Greythorn vehicle rows | Italic grey (`#808080`) |
| Projected rota rows | Amber (`#FFD966`) |
| Zero-weight rows (OSM, Support) | Italic grey (`#808080`) |
| Gridlines | Hidden |

### Email Delivery
- "Email to Me" sends the .xlsx to the user's `email` from their `profiles` row
- If no email is set: "No email present on user setup. Please contact system admin."
- Sent via Resend from `NOTIFY_FROM_EMAIL`

### CRITICAL: Greythorn Query Rules
- **Always `CAST(... AS DATE)`** when joining to `Calendar`
- **Always `CAST(numeric AS FLOAT)`** for any numeric column
- **Never `UNION ALL` with FLOAT columns** — run as separate queries
- **Always quote `[User]`** — SQL Server reserved word
- **Debrief has no `IsDeleted`** — use `IsApproved = 1` as sole quality gate
- **Column is `RegistrationNumber`** — not `Registration`
- **Column is `VehicleSupplierName`** — not `Name`
- **`VehicleSupplierId = 2`** = Greythorn
- **`ContractorAdditionalPayReasonId = 7`** = Deposit Return
- **BranchId from Debrief** — join `Branch` via `d.BranchId`, not `ContractType.BranchId`
- **`VehicleOwnershipTypeId`** lives on `Vehicle` table, not `ContractorVehicle`
- **DA Supplied vehicles** — `VehicleOwnershipType.IsOwnedByContractor = 1` means DA/contractor supplied their own vehicle; `!= 1` means Greythorn/company vehicle
- **`ContractorVehicleDeposit` split query** — isolate ID lookup (Part 1A) from detail fetch (Part 1B) to avoid SQL Server bit+JOIN silent failure

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

---

## Platform Admin Features

### User Management (`/apps/admin`)

- **Create users** — display ID, full name, email, password, type (internal/external), admin flag, app access with per-report-type permissions
- **Edit users** — inline edit of display ID, full name, email, type
- **Toggle admin** — make/remove platform admin (cannot modify own status)
- **Deactivate/Reactivate** — sets `is_active` on profile and bans/unbans in Supabase Auth
- **Reset password** — admin can set a new password for any user
- **Delete users** — with confirmation prompt, cascades via FK
- **Edit app access** — per-user app assignments with sub-permissions (e.g. report types)
- **Search** — across display ID, full name, and email

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
- **Railway proxy:** https://gsapps-production.up.railway.app
- **Resend sender domain:** greythornservices.uk
- **Admin email:** miten@greythorn.services

---

## Current State (as of 21 March 2026)

### Multi-App Platform — Live, Pushed to GitHub

- App launcher at `/apps` with card-based UI
- `user_apps` table for per-app access control with `permissions` JSONB
- Middleware enforces per-app authorisation
- Navbar is multi-app aware with contextual navigation — Greythorn logo PNG at 28x28px
- Navbar has hamburger menu on mobile (below `sm` breakpoint) with dropdown for nav links, user info, and sign out
- Platform admin at `/apps/admin` for user management (including admin password reset)
- Components namespaced under `components/referrals/`, `components/reports/`, `components/platform/`
- All referral routes under `/referrals/` prefix
- Old URLs redirected via `next.config.ts`
- Repo renamed to `gs_apps` on GitHub, Vercel, and Supabase
- Local directory renamed to `gs_apps`
- Login page uses Greythorn strapline logo with subtle gradient background, tries both `@greythorn.internal` and `@greythorn.external` domains sequentially (no regex-based domain detection)
- Browser favicon set to Greythorn "G" logo (`/greythorn-logo.png`) via metadata in `app/layout.tsx`

### Referrals App — Fully Built

All 11 original build phases complete. Referrals app is live at `/referrals/*`.
- Redundant referrals user management screen (`/referrals/admin/users`) removed — all user management via platform admin at `/apps/admin`
- My Referrals page: mobile-friendly card layout (below `sm`), desktop table unchanged
- Submit form: responsive padding (`p-5 sm:p-8`)
- Success toast: auto-dismisses after 4s with fade animation, cleans URL query param
- Empty state: icon + "Register your first referral" CTA link

### Referrals User Guide — Created

- Non-admin user guide at `docs/REFERRALS_USER_GUIDE.md` and `docs/Referrals_User_Guide.pdf`
- Written in plain English for users whose first language is not English
- Covers: submission steps, 7-day rule (REF-003), one-per-contractor rule (REF-001), 6-month returning contractor rule (REF-002), email to SLT@greythorn.services required for validation, 30-day working day threshold, half-day contract types (Nursery L1/2/3 & Sameday_6), status meanings, My Referrals page
- PDF generated via `scripts/generate_referrals_guide_pdf.py` (uses reportlab) — re-run to regenerate after edits

### Reports App — Fully Built

All 8 build phases complete plus additional reports. Reports app is live at `/reports`:
- Phase 1: Railway proxy service (deployed, health check passing)
- Phase 2: Deposit report endpoint
- Phase 3: Working day count endpoint (renamed to "Contractor - Working Day Count")
- Phase 4: Auth gate + report-level permissions
- Phase 5: Reports page with HR code input + report selector
- Phase 6: In-browser formatted report preview
- Phase 7: ExcelJS generation with house style + download
- Phase 8: Resend email delivery with .xlsx attachment
- Additional: Working Days by Client report with visualisations (filters + Recharts + grouped table)
- Additional: DA Relations Settlement Data report — 5 collapsible sections with collapsed header summaries, account status, vehicles since deposit, vehicle charges, remittances
- Deposit report updated: now uses split query pattern (like Settlement), shows only most recent deposit with instalment payments as separate section, 5 collapsible sections with collapsed header summaries

### Build Configuration

- `next.config.ts` includes `serverExternalPackages: ['exceljs']` (Turbopack mangles external module names)
- `package.json` build script uses `next build --webpack` (Turbopack ignores `serverExternalPackages`)
- Resend client instantiated inside handler functions (not at module scope) to avoid build-time env var errors
- TypeScript pinned at 5.9.3 in package-lock.json

### Pending Migrations

Check which migrations have been applied to Supabase. The following exist in the repo:
- `001_initial_schema.sql` — core tables, RLS, triggers
- `002_user_apps.sql` — multi-app user access table
- `003_profile_fields.sql` — add full_name, email, is_active to profiles
- `004_user_apps_permissions.sql` — add permissions JSONB to user_apps

### Users

- **Admin:** m.patel (external, is_admin: true) — platform superadmin
- **12 recruiter accounts** — internal, granted `referrals` app access
- **165 referrals** seeded from 2025 data
- **3,441 contractors** synced from Greythorn (last sync: 18 March 2026)

### Key Technical Decisions

1. **Active/inactive status** uses `ContractorAccountStatusHistory.Active` (not `CurrentRecruitmentStatusId`)
2. **Status change date** from `ContractorAccountStatusHistory.CreatedAt`
3. **ODBC Driver auto-detection** — Python scripts detect ODBC Driver 18 or 17 automatically via `get_odbc_driver()`
4. **Profile trigger** requires `SET search_path = public`
5. **REF-001 duplicate check** runs during HR code validation, before REF-002
6. **Greythorn DB is Azure SQL** — accessed via Railway proxy for static IP
7. **`is_admin` on profiles** is platform-wide superadmin — admins bypass all app access checks
8. **`user_apps` table** gates per-user app access; middleware checks on every request
9. **`permissions` JSONB** on `user_apps` for sub-level access (e.g. per-report-type)
10. **Railway proxy** provides static outbound IP for SQL Server whitelist
11. **`is_active` null safety** — frontend uses `=== false` to treat null (pre-migration) as active
12. **Email delivery** goes to user's own email from profiles; errors if no email set
13. **`autoComplete="off"`** on all forms to prevent browser value retention
14. **Login domain detection** — tries both internal and external domains sequentially; no restriction on username format for internal users
15. **No temporary files** — all processing stays in memory across the entire chain (Vercel, Railway, Supabase); Excel buffers, JSON payloads all in-memory
16. **`ContractorVehicleDeposit` split query** — Part 1A isolates ID, Part 1B fetches details, to avoid SQL Server bit+JOIN silent failure
17. **Vehicle ownership** — `VehicleOwnershipType` joined via `Vehicle.VehicleOwnershipTypeId`; `IsOwnedByContractor = 1` = DA supplied (contractor's own); `!= 1` = Greythorn/company vehicle

---

## Working Style Notes

- British English throughout all user-facing text
- All dates displayed DD/MM/YYYY (UK locale)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser-side code
- **No temporary files** — never write temp files to any system in the chain; all processing must stay in memory
- If a Greythorn query produces unexpected results, check the CRITICAL rules section first
- When adding a new app, follow the "How to add a new app" checklist above
- When adding a new report type, update: Railway proxy endpoint, Vercel API route, ReportRunner labels, reports page ALL_REPORT_TYPES, Excel generator, download/email routes, APP_PERMISSIONS in PlatformUserManagement

---

*End of CLAUDE.md*
