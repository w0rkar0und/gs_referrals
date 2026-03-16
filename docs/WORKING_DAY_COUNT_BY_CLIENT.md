# Working Day Count by Client / Branch / Contract Type

## Overview

A fleet-wide operational report that produces a **weighted working day count** for the last completed Greythorn epoch week, broken down by client, branch, and contract type, with a site-level total per client/branch combination.

This report requires **no HR code input**. It scans all approved debriefs across all active contractors for the target week and aggregates them into a structured summary. It is a single query — not split like the contractor-level referral query.

Originally scoped to Amazon only. Now covers all clients.

---

## Target Week

Always the **last completed** Greythorn epoch week — never the current week.

> Greythorn epoch weeks run **Sunday to Saturday**.

The last completed year and week are resolved inline:

```sql
-- Last completed year
SELECT CASE WHEN GtEpochWeek = 1
            THEN GtEpochYear - 1
            ELSE GtEpochYear END
FROM Calendar WHERE Date = CAST(GETDATE() AS DATE)

-- Last completed week number
SELECT CASE WHEN GtEpochWeek = 1
            THEN (SELECT MAX(GtEpochWeek) FROM Calendar
                  WHERE GtEpochYear = (
                      SELECT GtEpochYear - 1
                      FROM Calendar
                      WHERE Date = CAST(GETDATE() AS DATE)
                  ))
            ELSE GtEpochWeek - 1 END
FROM Calendar WHERE Date = CAST(GETDATE() AS DATE)
```

The week-1 boundary requires special handling — if the current week is week 1, the previous week is the final week of the prior year, requiring the `MAX(GtEpochWeek)` lookup above.

---

## Day Weighting Rules

Three tiers applied via a `CASE` expression **in SQL** (not the application layer — this query aggregates across all contractors and must produce weighted totals in the database).

| Contract Type | Match Type | Weight |
|---|---|---|
| `OSM` | Exact | **0.0** |
| `Support` | Exact | **0.0** |
| `Sameday_6%` | Prefix (`LIKE`) | **0.5** |
| Everything else | — | **1.0** |

OSM and Support represent non-standard delivery support roles and are excluded from the working day count. They still appear as rows in the output with `WeightedDays = 0.0` — they are not filtered out.

---

## Site Totals

A `SiteTotal` column is produced for each `ClientName + BranchName` combination using a nested window function, avoiding a second query:

```sql
SUM(SUM(...weighted CASE...)) OVER (PARTITION BY cl.ClientName, b.BranchName)
```

This gives every row in a site group the same site-level total, allowing the application to render a summary row without additional computation.

---

## Full Query

```sql
SELECT
    CONVERT(VARCHAR(50), cl.ClientName)       AS ClientName,
    CONVERT(VARCHAR(50), b.BranchName)        AS BranchName,
    CONVERT(VARCHAR(80), ct.ContractTypeName) AS ContractTypeName,
    COUNT(*)                                  AS ShiftCount,
    SUM(
        CASE
            WHEN ct.ContractTypeName = 'OSM'          THEN 0.0
            WHEN ct.ContractTypeName = 'Support'       THEN 0.0
            WHEN ct.ContractTypeName LIKE 'Sameday_6%' THEN 0.5
            ELSE 1.0
        END
    )                                         AS WeightedDays,
    SUM(SUM(
        CASE
            WHEN ct.ContractTypeName = 'OSM'          THEN 0.0
            WHEN ct.ContractTypeName = 'Support'       THEN 0.0
            WHEN ct.ContractTypeName LIKE 'Sameday_6%' THEN 0.5
            ELSE 1.0
        END
    )) OVER (PARTITION BY cl.ClientName, b.BranchName) AS SiteTotal
FROM Debrief d
JOIN Contractor c    ON c.ContractorId    = d.ContractorId
JOIN ContractType ct ON ct.ContractTypeId = d.ContractTypeId
JOIN Client cl       ON cl.ClientId       = ct.ClientId
JOIN Branch b        ON b.BranchId        = d.BranchId
JOIN Calendar cal    ON cal.Date          = CAST(d.Date AS DATE)
WHERE d.IsApproved = 1
  AND cal.GtEpochYear = (
      SELECT CASE WHEN GtEpochWeek = 1
                  THEN GtEpochYear - 1
                  ELSE GtEpochYear END
      FROM Calendar WHERE Date = CAST(GETDATE() AS DATE)
  )
  AND cal.GtEpochWeek = (
      SELECT CASE WHEN GtEpochWeek = 1
                  THEN (SELECT MAX(GtEpochWeek) FROM Calendar
                        WHERE GtEpochYear = (
                            SELECT GtEpochYear - 1
                            FROM Calendar
                            WHERE Date = CAST(GETDATE() AS DATE)
                        ))
                  ELSE GtEpochWeek - 1 END
      FROM Calendar WHERE Date = CAST(GETDATE() AS DATE)
  )
GROUP BY cl.ClientName, b.BranchName, ct.ContractTypeName
ORDER BY cl.ClientName, b.BranchName, ct.ContractTypeName
```

---

## Critical Implementation Notes

| Rule | Detail |
|---|---|
| **No contractor filter** | No `HrCode` parameter — runs across all contractors with approved debriefs in the target week |
| **BranchId from Debrief** | Join `Branch` via `d.BranchId`, not via `ContractType.BranchId` — they can differ |
| **Calendar join requires CAST** | `cal.Date = CAST(d.Date AS DATE)` — direct equality silently returns zero rows due to time component on `Debrief.Date` |
| **OSM / Support are exact matches** | Use `=`, not `LIKE` — partial match would incorrectly catch unrelated contract types |
| **Sameday_6 is a prefix match** | `LIKE 'Sameday_6%'` covers all branch variants |
| **Single query is safe** | The weighted `CASE` values are inside `SUM()` aggregates — this avoids the UNION ALL + FLOAT silent-failure issue that affects the referral query |
| **Debrief has no IsDeleted** | Use `IsApproved = 1` as the sole quality gate — there is no `IsDeleted` column on `Debrief` |
| **Always quote [User]** | Not needed in this query, but noted for consistency — `User` is a reserved word in SQL Server |

---

## Output Columns

| Column | Type | Description |
|---|---|---|
| `ClientName` | string | Client name (e.g. Amazon, DPD, Evri) |
| `BranchName` | string | Depot/branch name (e.g. Brighton, Romford) |
| `ContractTypeName` | string | Contract type (e.g. Core, LWB Core, Nursery L1) |
| `ShiftCount` | integer | Raw number of approved debriefs |
| `WeightedDays` | float | Shift count × weight (0.0 / 0.5 / 1.0) |
| `SiteTotal` | float | Sum of `WeightedDays` across all contract types for this client + branch |

---

## Railway Endpoint

```
POST /report/working-days-by-client
Authorization: X-Report-Secret header required
Body: {}  — no parameters
```

Returns a JSON array. Each element contains the six columns above.

---

## Excel Output (House Style)

Follows the standard Greythorn house style with these additions specific to this report:

| Element | Style |
|---|---|
| Title row | Dark navy (`#1F3864`), white bold — "Working Day Count by Client / Branch / Contract Type — Week {N}, {Year}" |
| Column headers | Dark navy (`#1F3864`), white bold |
| Client/branch group banner | Mid-blue (`#2E75B6`), white bold — one per unique `ClientName + BranchName` |
| Data rows | Alternating white / light blue (`#DEEAF1`) |
| Zero-weight rows (OSM, Support) | Italic grey text (`#808080`) — still shown, `WeightedDays` = 0.0 |
| Site total row | Green (`#E2EFDA`), bold — one per client/branch group, shows `SiteTotal` |
| Gridlines | Hidden |
| Frozen pane | Row 3 (below title + column headers) |

Column order: **Client → Branch → Contract Type → Shifts → Weighted Days → Site Total**

---

## Known Clients (Live Data, March 2026)

| ClientId | ClientName |
|---|---|
| 1 | Evri |
| 4 | Amazon |
| 5 | Warehouse |
| 6 | Fairview |
| 7 | ParcelDirect |
| 8 | DPD |
| 9 | Greythorn (internal) |
| 10 | Pharmacy |
| 11 | Champers |
| 12 | Modern Milkman |
| 13 | UPS |
| 14 | Yodel |
| 15 | DeliveryApp |
| 16 | Other |
| 18 | Motor Nation |
