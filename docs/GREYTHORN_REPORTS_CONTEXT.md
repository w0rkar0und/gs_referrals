# Greythorn Self-Service Reports — Claude Code Context Document

## Purpose of This Document

This document provides full context for extending an existing Next.js / Supabase / Vercel project with a self-service reporting module that exposes controlled queries against the Greythorn fleet management SQL Server database. It covers goals, architecture, infrastructure constraints, query logic, and expected outputs in sufficient depth for a Claude Code session to implement the feature end to end.

---

## 1. Project Goal

A subset of authenticated users needs the ability to run pre-defined reports against the Greythorn SQL Server database via a web browser — without needing access to Claude, any BI tool, or the database itself.

The two initial report types are:

- **Deposit Report** — A four-section summary of a contractor's vehicle deposit status, vehicle usage history, vehicle charges, and deposit return audit.
- **Working Day Count Report** — A per-contractor weekly working day count derived from approved delivery shift records and current-week rota projections.

Users will identify a contractor by their **HR code** (format: `X######`, e.g. `X003663`). The system will run the appropriate queries, present results in a formatted in-browser table, and offer both a **downloadable Excel file** (house style applied) and an optional **email delivery** via Resend.

---

## 2. Infrastructure & Architecture

### 2.1 Existing Stack

| Component | Platform | Role |
|---|---|---|
| Frontend + API routes | **Vercel** (Next.js) | UI, authentication, report generation, file download |
| Auth + user management | **Supabase** (Pro plan) | Login, session management, role-based access control |
| Source control + CI/CD | **GitHub** | Repo, auto-deploy to Vercel on push |
| Email delivery | **Resend** (separate domain configured) | Send `.xlsx` report as email attachment |
| SQL proxy | **Railway** (Pro plan) | Static outbound IP → SQL Server whitelist |

### 2.2 The Static IP Constraint

The Greythorn SQL Server only accepts connections from **whitelisted IP addresses**. Neither Vercel serverless functions nor Supabase Edge Functions provide a stable outbound IP — both use dynamic shared infrastructure.

**Railway (Pro plan)** resolves this. A small Node.js service deployed to Railway with Static Outbound IPs enabled presents a single, stable IPv4 address for all outbound connections. That IP is whitelisted on the SQL Server firewall.

Vercel API routes do **not** connect to SQL Server directly. They call the Railway proxy over HTTPS with a shared secret, and the Railway service executes the SQL and returns JSON.

### 2.3 Full Request Flow

```
Browser (authenticated user)
    │
    │  HTTPS + Supabase JWT
    ▼
Vercel API Route
(/api/reports/deposit or /api/reports/working-days)
    │
    │  HTTPS POST + shared secret header
    │  { reportType, hrCode, ...params }
    ▼
Railway Proxy Service (Node.js)
    │  Static outbound IP — whitelisted on SQL Server
    │
    ▼
SQL Server (Greythorn)
    │
    │  JSON result set
    ▼
Railway → Vercel API Route
    │
    ├──► In-browser table render (React)
    ├──► ExcelJS → .xlsx download (house style)
    └──► Resend → email with .xlsx attachment
```

### 2.4 Security Model

- All report endpoints on Vercel require a valid Supabase session JWT.
- The Railway proxy validates a `X-Report-Secret` header (shared secret stored as env var on both sides) — it will not serve requests without it.
- The SQL Server connection string (host, port, user, password, database) is stored as Railway environment variables only — never exposed to Vercel or the browser.
- Access control within the app is managed via a Supabase `profiles` table with a `reports_access` boolean column. Only users where `reports_access = true` can reach report endpoints.

### 2.5 Environment Variables

**Vercel (Next.js)**
```
RAILWAY_PROXY_URL=https://your-service.railway.app
RAILWAY_PROXY_SECRET=<shared secret>
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
RESEND_FROM_ADDRESS=reports@yourdomain.com
```

**Railway**
```
MSSQL_HOST=...
MSSQL_PORT=1433
MSSQL_USER=...
MSSQL_PASSWORD=...
MSSQL_DATABASE=...
PROXY_SECRET=<same shared secret>
PORT=3000
```

---

## 3. Greythorn Database Overview

Greythorn is a commercial vehicle fleet management platform for delivery contractor operations (primarily parcel delivery for clients like DPD). All queries are against a **Microsoft SQL Server** database.

### 3.1 Core Identifier

Every contractor is identified by an **HrCode** (e.g. `X003663`) on the `Contractor` table. All downstream queries resolve from this.

### 3.2 Critical SQL Server Data Type Rules

These rules are non-negotiable. Violating them causes **silent empty result sets** with no error — the most dangerous failure mode possible.

| Rule | Detail |
|---|---|
| **Always CAST numeric columns** | Every column of type `numeric` must be wrapped: `CAST(Amount AS FLOAT)`. Applies to: Amount, DepositAmount, Rate, Mileage, Value, RentalRate, InsuranceRate, CompletedMileage, and all other numeric columns. |
| **Never UNION ALL with FLOAT output** | `UNION ALL` combining queries that output `CAST(... AS FLOAT)` columns silently returns empty. Run as two separate queries and merge in application code. |
| **Always quote [User]** | `User` is a reserved word in SQL Server. Always write `[User]`. |
| **Calendar joins require CAST to DATE** | `Calendar.Date` must be joined with `CAST(sourceColumn AS DATE)` — direct equality against datetime columns returns zero rows. |
| **Column is RegistrationNumber** | Not `Registration`, not `RegNumber`. |
| **Column is VehicleSupplierName** | Not `Name`, not `SupplierName`. |
| **Debrief has no IsDeleted** | Use `IsApproved = 1` as the quality gate. All other tables use `IsDeleted = 0` for active records. |

### 3.3 Contractor Lookup Pattern

Always resolve a contractor via HrCode first:

```sql
SELECT c.ContractorId, c.HrCode,
       up.FirstName, up.LastName, up.Email, up.PhoneNumber
FROM Contractor c
JOIN [User] u ON u.UserId = c.UserId
JOIN UserProfile up ON up.UserId = u.UserId
WHERE c.HrCode = 'X003663'
```

### 3.4 Key Reference Values

**VehicleSupplier**
| ID | Name |
|----|------|
| 2 | Greythorn ← the primary supplier for report filtering |

**ContractorAdditionalPayReason**
| ID | Name |
|----|------|
| 7 | Deposit Return ← used in Deposit Return audit section |

**RotaActivity (IsNonWork = 0 means a working day)**
| ID | Code | Description |
|----|------|-------------|
| 1 | FD | Full day |
| 4 | HD | Half day |

---

## 4. Deposit Report — Full Specification

### 4.1 Purpose

The Deposit Report provides a complete picture of a contractor's financial relationship with Greythorn in relation to vehicle deposits. It shows what has been collected, what vehicles they drove, what charges they incurred, and whether a Deposit Return payment has been made.

### 4.2 Report Structure

The report is divided into **four sections**, each rendered as its own table block in the UI and Excel output.

---

#### Section 1 — Deposit Details

**What it shows:** All deposit records for the contractor (active and cancelled), with instalment payment history and audit trail for any cancellations.

**Key rules:**
- Show ALL deposit records regardless of `IsDeleted` status (both active and cancelled are meaningful)
- For each deposit, show a sub-row audit trail for any associated transactions
- Cancelled deposits (`IsDeleted = 1`) are visually flagged
- Audit columns (`CreatedBy`, `UpdatedBy`, `DeletedBy`) are resolved to display names via `[User]` → `UserProfile`

**Query:**

```sql
-- Step 1: Get all deposit records for contractor
SELECT
    d.ContractorVehicleDepositId,
    CAST(d.DepositAmount AS FLOAT) AS DepositAmount,
    d.DepositWeeks,
    d.IsDeleted AS IsCancelled,
    CONVERT(VARCHAR, d.CreatedAt, 103) AS CreatedDate,
    cu.FirstName + ' ' + cu.LastName AS CreatedBy,
    CONVERT(VARCHAR, d.UpdatedAt, 103) AS UpdatedDate,
    uu.FirstName + ' ' + uu.LastName AS UpdatedBy,
    CONVERT(VARCHAR, d.DeletedAt, 103) AS CancelledDate,
    du.FirstName + ' ' + du.LastName AS CancelledBy
FROM ContractorVehicleDeposit d
JOIN Contractor c ON c.ContractorId = d.ContractorId
JOIN [User] u ON u.UserId = c.UserId
-- Audit: CreatedBy
LEFT JOIN [User] cu ON cu.UserId = d.CreatedBy
LEFT JOIN UserProfile cup ON cup.UserId = cu.UserId
-- Audit: UpdatedBy
LEFT JOIN [User] uu ON uu.UserId = d.UpdatedBy
LEFT JOIN UserProfile uup ON uup.UserId = uu.UserId
-- Audit: DeletedBy / CancelledBy
LEFT JOIN [User] du ON du.UserId = d.DeletedBy
LEFT JOIN UserProfile dup ON dup.UserId = du.UserId
WHERE c.HrCode = @HrCode

-- Step 2: Get transactions for each deposit (run separately per DepositId)
SELECT
    t.ContractorVehicleDepositTransactionId,
    CAST(t.Amount AS FLOAT) AS Amount,
    t.IsDeleted,
    CONVERT(VARCHAR, t.CreatedAt, 103) AS Date,
    cu.FirstName + ' ' + cu.LastName AS CreatedBy
FROM ContractorVehicleDepositTransaction t
LEFT JOIN [User] cu ON cu.UserId = t.CreatedBy
LEFT JOIN UserProfile cup ON cup.UserId = cu.UserId
WHERE t.ContractorVehicleDepositId = @DepositId
```

> **Important:** Do not attempt to LEFT JOIN the transactions inline as a subquery — this pattern silently returns empty sets. Run the transaction query separately per deposit ID and merge in application code.

---

#### Section 2 — Vehicle Usage History

**What it shows:** Every vehicle the contractor has been assigned to, with assignment dates and vehicle supplier.

**Key rules:**
- Show **all** vehicles (all suppliers), not just Greythorn vehicles
- Non-Greythorn vehicles (where `VehicleSupplierId != 2` OR `VehicleSupplierId IS NULL`) are rendered in **italic grey** in both the UI and Excel output
- `NULL VehicleSupplierId` means the supplier record is missing on the vehicle — this is a data quality issue, not a valid state
- `ToDate = NULL` means currently assigned — display as "Current"

**Query:**

```sql
SELECT
    CONVERT(VARCHAR(20), v.RegistrationNumber) AS VRM,
    CONVERT(VARCHAR(50), vm.VehicleModelName) AS Model,
    CONVERT(VARCHAR(50), vmk.VehicleMakeName) AS Make,
    CONVERT(VARCHAR(50), ISNULL(vs.VehicleSupplierName, 'Unknown')) AS Supplier,
    v.VehicleSupplierId,
    CONVERT(VARCHAR, cv.FromDate, 103) AS FromDate,
    CONVERT(VARCHAR, cv.ToDate, 103) AS ToDate
FROM ContractorVehicle cv
JOIN Vehicle v ON v.VehicleId = cv.VehicleId
LEFT JOIN VehicleSupplier vs ON vs.VehicleSupplierId = v.VehicleSupplierId
LEFT JOIN VehicleModel vm ON vm.VehicleModelId = v.VehicleModelId
LEFT JOIN VehicleMake vmk ON vmk.VehicleMakeId = vm.VehicleMakeId
JOIN Contractor c ON c.ContractorId = cv.ContractorId
WHERE c.HrCode = @HrCode
ORDER BY cv.FromDate DESC
```

**Presentation rule:** In application code, flag a row as non-Greythorn if `VehicleSupplierId != 2`. Apply italic grey styling to those rows in the UI and Excel.

---

#### Section 3 — Vehicle Charges

**What it shows:** All vehicle charges attributed to the contractor during their assignment windows, with payment status.

**Key rules:**
- A charge belongs to a **vehicle**, not a contractor — attribution is via `ContractorVehicle` date window matching
- Only show charges where the vehicle was a Greythorn vehicle (`VehicleSupplierId = 2`)
- Only show active charges (`VehicleCharge.IsDeleted = 0`)
- Show how much has been paid and what remains outstanding

**Query:**

```sql
SELECT
    CONVERT(VARCHAR(20), v.RegistrationNumber) AS VRM,
    CONVERT(VARCHAR(30), vcr.VehicleChargeReasonName) AS Reason,
    CONVERT(VARCHAR(50), vc.Reference) AS Reference,
    CONVERT(VARCHAR, vc.IssueDate, 103) AS IssueDate,
    CAST(vc.Amount AS FLOAT) AS Charged,
    ISNULL(p.TotalPaid, 0) AS Paid,
    ROUND(CAST(vc.Amount AS FLOAT) - ISNULL(p.TotalPaid, 0), 2) AS Outstanding
FROM VehicleCharge vc
JOIN Vehicle v ON v.VehicleId = vc.VehicleId
JOIN VehicleChargeReason vcr ON vcr.VehicleChargeReasonId = vc.VehicleChargeReasonId
JOIN ContractorVehicle cv
    ON cv.VehicleId = vc.VehicleId
    AND cv.ContractorId = (
        SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode
    )
    AND vc.IssueDate >= CAST(cv.FromDate AS DATE)
    AND vc.IssueDate <= ISNULL(CAST(cv.ToDate AS DATE), GETDATE())
LEFT JOIN (
    SELECT VehicleChargeId, SUM(CAST(Amount AS FLOAT)) AS TotalPaid
    FROM VehicleChargeTransaction
    WHERE IsDeleted = 0
    GROUP BY VehicleChargeId
) p ON p.VehicleChargeId = vc.VehicleChargeId
WHERE vc.IsDeleted = 0
  AND v.VehicleSupplierId = 2
ORDER BY vc.IssueDate
```

---

#### Section 4 — Deposit Return Audit

**What it shows:** Whether a "Deposit Return" additional pay record exists for this contractor. This is the record that confirms a deposit has been formally returned.

**Key rules:**
- Filter `ContractorAdditionalPay` by `ContractorAdditionalPayReasonId = 7` (Deposit Return)
- Filter to `IsDeleted = 0` (active records only)
- If **no records are found**, render an **amber informational row** stating "No Deposit Return record found" — do not leave the section blank
- If records exist, display them with amount, date, and audit user

**Query:**

```sql
SELECT
    CAST(cap.Amount AS FLOAT) AS Amount,
    CONVERT(VARCHAR, cap.Date, 103) AS Date,
    cap.IsDeleted,
    cu.FirstName + ' ' + cu.LastName AS CreatedBy,
    CONVERT(VARCHAR, cap.CreatedAt, 103) AS CreatedDate
FROM ContractorAdditionalPay cap
JOIN Contractor c ON c.ContractorId = cap.ContractorId
LEFT JOIN [User] cu ON cu.UserId = cap.CreatedBy
LEFT JOIN UserProfile cup ON cup.UserId = cu.UserId
WHERE c.HrCode = @HrCode
  AND cap.ContractorAdditionalPayReasonId = 7
  AND cap.IsDeleted = 0
ORDER BY cap.Date DESC
```

---

## 5. Working Day Count Report — Full Specification

### 5.1 Purpose

The Working Day Count Report produces a per-contractor, per-week summary of working days. It is used primarily for referral tracking and payroll verification. The report covers **confirmed** working days (from approved debriefs) and **projected** working days (from the current week's rota entries where debriefs haven't yet been submitted or approved).

### 5.2 Core Concepts

#### The Greythorn Calendar

Greythorn uses its own epoch-based week numbering system. The `Calendar` table maps every calendar date to a `GtEpochYear` and `GtEpochWeek`. All weekly grouping in reports must use this table — never use SQL Server's native `DATEPART(week, ...)`.

To find the current epoch year and week:
```sql
SELECT GtEpochYear, GtEpochWeek
FROM Calendar
WHERE Date = CAST(GETDATE() AS DATE)
```

#### The Two Data Sources

Working days come from two places depending on what exists for a given week:

1. **Approved Debriefs** (`Debrief` table, `IsApproved = 1`) — A debrief is the daily delivery shift record. When approved, it is the authoritative source for whether a contractor worked that day. Debriefs have no `IsDeleted` column — `IsApproved = 1` is the only quality gate.

2. **Rota Entries** (`ContractorRota` table) — The rota is the contractor's planned schedule. For the **current week only**, where no approved debrief yet exists for a given rota date, the rota entry serves as a projection of likely working days. Rota entries for the current week must be filtered by the current `GtEpochYear` and `GtEpochWeek`.

#### The Half-Day Rule

Some contract types are nursery routes and represent only half a day's work. Contract types matching the following patterns count as **0.5 days per shift** — all others count as **1.0 day per shift**:

| Pattern (LIKE match) |
|---|
| `NL 1%` |
| `NL 2%` |
| `NL 3%` |
| `Nursery 1%` |
| `Nursery 2%` |
| `Nursery L1%` |
| `Nursery L2%` |
| `Nursery L3%` |

This calculation is applied in the **presentation layer** (application code), not in SQL. The SQL returns `ShiftCount` and `ContractTypeName`. The application multiplies `ShiftCount` by 0.5 or 1.0 based on pattern matching against `ContractTypeName`.

#### Why Two Separate Queries (Never UNION ALL)

The working day count would naturally be expressed as a `UNION ALL` of the approved debrief rows and the rota projection rows. **This must not be done.** A known SQL Server behaviour causes `UNION ALL` queries that include `CAST(... AS FLOAT)` in computed columns to silently return empty result sets. The two parts must be run as separate queries and merged in application code.

### 5.3 The Calendar Join Bug

When joining `Calendar` to `Debrief` or `ContractorRota`, you must use `CAST(d.Date AS DATE)` or `CAST(r.Date AS DATE)` — **never a direct equality join**. The `Date` columns on these tables include a time component that prevents direct calendar matching, causing zero rows to be returned silently.

**Wrong:**
```sql
JOIN Calendar cal ON cal.Date = d.Date
```

**Correct:**
```sql
JOIN Calendar cal ON cal.Date = CAST(d.Date AS DATE)
```

This also applies inside `NOT EXISTS` subqueries.

### 5.4 Part 1 — Approved Debriefs Query

Returns confirmed working days, grouped by contractor, week, and contract type.

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
GROUP BY
    c.HrCode, up.FirstName, up.LastName,
    cal.GtEpochYear, cal.GtEpochWeek,
    ct.ContractTypeName
ORDER BY cal.GtEpochYear DESC, cal.GtEpochWeek DESC
```

### 5.5 Part 2 — Current Week Rota Projection Query

Returns projected working days for the **current Greythorn week only**, excluding any dates that already have an approved debrief.

The current year and week must be resolved first (see Section 5.2), then passed as parameters `@CurrentYear` and `@CurrentWeek`.

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
  AND NOT EXISTS (
      SELECT 1
      FROM Debrief d
      WHERE d.ContractorId = r.ContractorId
        AND CAST(d.Date AS DATE) = CAST(r.Date AS DATE)
        AND d.IsApproved = 1
  )
GROUP BY
    c.HrCode, up.FirstName, up.LastName,
    cal.GtEpochYear, cal.GtEpochWeek,
    ct.ContractTypeName
```

### 5.6 Merging and Calculating Final Day Counts

After both queries return results, merge them in application code and calculate final day counts:

```javascript
function isHalfDay(contractTypeName) {
  const patterns = [
    /^NL 1/i, /^NL 2/i, /^NL 3/i,
    /^Nursery 1/i, /^Nursery 2/i,
    /^Nursery L1/i, /^Nursery L2/i, /^Nursery L3/i
  ];
  return patterns.some(p => p.test(contractTypeName));
}

function calculateDays(row) {
  const multiplier = isHalfDay(row.ContractType) ? 0.5 : 1.0;
  return row.ShiftCount * multiplier;
}

// Merge both result sets
const allRows = [...approvedRows, ...rotaRows].map(row => ({
  ...row,
  DayCount: calculateDays(row)
}));
```

---

## 6. Excel Output — House Style

All downloadable reports must follow the Greythorn house style using **ExcelJS**:

| Element | Style |
|---|---|
| Title row | Dark navy background (`#1F3864`), white bold text |
| Column headers | Dark navy background (`#1F3864`), white bold text |
| Section banners | Mid-blue background (`#2E75B6`), white bold text |
| Alternating data rows | White / light blue (`#DEEAF1`) |
| Nil-record notice rows | Amber background (`#FFD966`), dark text, italic |
| Summary/total rows | Green background (`#E2EFDA`), bold text |
| Non-Greythorn vehicle rows | Italic grey text (`#808080`) |
| Projected rota rows | Amber background (`#FFD966`) |
| Gridlines | Hidden |
| Frozen pane | Row 5 (below title + column headers) |

---

## 7. Build Phases

Implement in this order:

| Phase | Deliverable |
|---|---|
| **1** | Railway proxy service: Node.js app, MSSQL connection, `/health` endpoint, secret validation middleware |
| **2** | Railway: Deposit report endpoint — runs all four section queries, returns structured JSON |
| **3** | Railway: Working Day Count endpoint — runs both queries (separate), merges, returns structured JSON |
| **4** | Next.js: Supabase auth gate + `reports_access` role check middleware |
| **5** | Next.js: `/reports` page — HR code input, report type selector, calls Vercel API route |
| **6** | Next.js: In-browser formatted report preview (table components per section) |
| **7** | Next.js: ExcelJS report generation with house style + download |
| **8** | Next.js: Resend email delivery with `.xlsx` attachment |

---

## 8. Railway Proxy — Technical Notes

- Runtime: **Node.js** with `mssql` npm package
- Framework: **Express.js** (lightweight, sufficient for this workload)
- Auth: `X-Report-Secret` header checked on every request — return `401` if missing or incorrect
- All SQL Server credentials in Railway environment variables only
- Enable **Static Outbound IPs** in Railway dashboard → Service Settings → Networking, then whitelist the shown IPv4 on the SQL Server firewall
- The proxy is not publicly browsable — it only serves authenticated calls from the Vercel API routes
- Suggested endpoints:
  - `POST /report/deposit` → `{ hrCode: string }`
  - `POST /report/working-days` → `{ hrCode: string }`
  - `GET /health` → `{ status: 'ok' }`

---

## 9. Access Control

The Supabase `profiles` table (or equivalent user metadata table in the existing project) should have a `reports_access` boolean column. The Vercel API route middleware must:

1. Validate the Supabase JWT from the request
2. Look up the user's `reports_access` flag via the Supabase service role client
3. Return `403` if `reports_access` is false or absent

This allows access to be granted or revoked per user from the Supabase dashboard without code changes.

---

## 10. Key Constraints Summary

| Constraint | Rule |
|---|---|
| SQL numeric columns | Always `CAST(... AS FLOAT)` — no exceptions |
| UNION ALL | Never use with FLOAT output — run as separate queries |
| [User] table | Always quoted as `[User]` in SQL |
| Calendar joins | Always `CAST(sourceDate AS DATE)` before joining Calendar |
| Static IP | All SQL Server connections must route through Railway |
| Debriefs | No `IsDeleted` — use `IsApproved = 1` only |
| VehicleSupplierName | Column name is `VehicleSupplierName` — not `Name` |
| RegistrationNumber | Column name is `RegistrationNumber` — not `Registration` |
| Deposit transactions | Run as separate query per DepositId — do not LEFT JOIN inline |
| Greythorn supplier ID | `VehicleSupplierId = 2` = Greythorn |
| Deposit Return reason | `ContractorAdditionalPayReasonId = 7` = Deposit Return |
| Half-day contracts | Apply 0.5 multiplier in application code, not SQL |
