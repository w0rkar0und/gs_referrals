"""
Greythorn Referral Check
Checks working days for a given HR code (or list) against Greythorn,
compares against 30-day threshold, and writes results to Supabase.

Usage:
  python scripts/referral_check.py X123456
  python scripts/referral_check.py X123456 X654321
  python scripts/referral_check.py --all
"""

import os
import sys
from datetime import datetime, UTC

import pyodbc
from dotenv import load_dotenv
from supabase import create_client

# Load .env from scripts/ directory
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

QUERY_VERSION = "v1.0"
THRESHOLD_DAYS = 30

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GT_DB_SERVER = os.environ["GT_DB_SERVER"]
GT_DB_NAME = os.environ["GT_DB_NAME"]
GT_DB_USER = os.environ["GT_DB_USER"]
GT_DB_PASSWORD = os.environ["GT_DB_PASSWORD"]
GT_DB_PORT = os.environ.get("GT_DB_PORT", "1433")


def get_odbc_driver() -> str:
    """Pick the best available ODBC Driver for SQL Server."""
    available = pyodbc.drivers()
    for version in ("18", "17"):
        name = f"ODBC Driver {version} for SQL Server"
        if name in available:
            return name
    raise RuntimeError(f"No suitable ODBC driver found. Available: {available}")


# Half-day contract type patterns
HALF_DAY_PATTERNS = [
    "NL 1%", "NL 2%", "NL 3%",
    "Nursery 1%", "Nursery 2%",
    "Nursery L1%", "Nursery L2%", "Nursery L3%",
]

PART1_QUERY = """
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
WHERE c.HrCode = ?
  AND d.IsApproved = 1
  AND CAST(d.Date AS DATE) >= ?
GROUP BY c.HrCode, up.FirstName, up.LastName,
         cal.GtEpochYear, cal.GtEpochWeek, ct.ContractTypeName
ORDER BY cal.GtEpochYear, cal.GtEpochWeek
"""

PART2_QUERY = """
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
WHERE c.HrCode = ?
  AND cal.GtEpochYear = ?
  AND cal.GtEpochWeek = ?
  AND ra.IsNonWork = 0
  AND CAST(r.Date AS DATE) >= ?
  AND NOT EXISTS (
    SELECT 1 FROM Debrief d
    WHERE d.ContractorId = r.ContractorId
      AND CAST(d.Date AS DATE) = CAST(r.Date AS DATE)
      AND d.IsApproved = 1
  )
GROUP BY c.HrCode, up.FirstName, up.LastName,
         cal.GtEpochYear, cal.GtEpochWeek, ct.ContractTypeName
"""

EPOCH_QUERY = """
SELECT GtEpochYear, GtEpochWeek
FROM Calendar
WHERE Date = CAST(GETDATE() AS DATE)
"""

FIRST_ROTA_QUERY = """
SELECT MIN(CAST(r.Date AS DATE)) AS FirstRotaDate
FROM ContractorRota r
JOIN Contractor c ON c.ContractorId = r.ContractorId
JOIN RotaActivity ra ON ra.RotaActivityId = r.RotaActivityId
WHERE c.HrCode = ?
  AND ra.IsNonWork = 0
"""


def is_half_day(contract_type: str) -> bool:
    ct = contract_type.strip()
    for pattern in HALF_DAY_PATTERNS:
        # Convert SQL LIKE pattern to simple prefix match
        prefix = pattern.replace("%", "")
        if ct.startswith(prefix):
            return True
    return False


def calc_working_days(shift_count: int, contract_type: str) -> float:
    return shift_count * 0.5 if is_half_day(contract_type) else float(shift_count)


def process_rows(rows):
    """Convert query result rows to list of dicts with working_days calculated."""
    result = []
    for row in rows:
        contract_type = row.ContractType.strip() if row.ContractType else ""
        shift_count = int(row.ShiftCount)
        working_days = calc_working_days(shift_count, contract_type)
        result.append({
            "source": row.Source.strip() if row.Source else "",
            "year": int(row.Year),
            "week": int(row.Week),
            "week_start": row.WeekStart,
            "week_end": row.WeekEnd,
            "contract_type": contract_type,
            "shift_count": shift_count,
            "working_days": working_days,
        })
    return result


def check_referral(cursor, supabase, hr_code: str, current_year: int, current_week: int):
    print(f"\n{'='*60}")
    print(f"Checking: {hr_code}")
    print(f"{'='*60}")

    # 1. Read referral from Supabase
    res = supabase.table("referrals").select("*").eq("recruited_hr_code", hr_code).single().execute()
    referral = res.data
    if not referral:
        print(f"  No referral found for {hr_code}")
        return {"hr_code": hr_code, "name": "—", "outcome": "skipped", "reason": "No referral found"}

    # 2. Already approved?
    if referral["status"] == "approved":
        print(f"  Already approved on {referral['approved_at']}. Skipping.")
        return {"hr_code": hr_code, "name": referral["recruited_name"], "outcome": "skipped", "reason": "Already approved"}

    start_date = referral["start_date"]
    print(f"  Start date: {start_date}")

    # 3. First rota entry date (discrepancy check)
    cursor.execute(FIRST_ROTA_QUERY, hr_code)
    first_rota_row = cursor.fetchone()
    first_rota_date = first_rota_row.FirstRotaDate if first_rota_row and first_rota_row.FirstRotaDate else None

    start_date_discrepancy_flag = False
    start_date_discrepancy_days = 0
    if first_rota_date:
        first_rota_str = first_rota_date.strftime("%Y-%m-%d") if hasattr(first_rota_date, "strftime") else str(first_rota_date)
        diff = abs((first_rota_date - datetime.strptime(start_date, "%Y-%m-%d").date()).days)
        start_date_discrepancy_days = diff
        if diff > 7:
            start_date_discrepancy_flag = True
            print(f"  WARNING: Start date discrepancy — first rota entry {first_rota_str} differs by {diff} days")
    else:
        first_rota_str = None
        print(f"  No rota entries found for this contractor")

    # 5. Part 1: approved debriefs since start_date
    cursor.execute(PART1_QUERY, hr_code, start_date)
    part1_rows = cursor.fetchall()
    part1 = process_rows(part1_rows)

    # 6. Part 2: current week rota projection
    cursor.execute(PART2_QUERY, hr_code, current_year, current_week, start_date)
    part2_rows = cursor.fetchall()
    part2 = process_rows(part2_rows)

    # 8. Sum totals
    working_days_approved = sum(r["working_days"] for r in part1)
    working_days_projected = sum(r["working_days"] for r in part2)
    working_days_total = working_days_approved + working_days_projected

    # 9. Threshold check
    threshold_met = working_days_total >= THRESHOLD_DAYS

    # 10. Build check_detail
    check_detail = {
        "start_date_filter": start_date,
        "query_version": QUERY_VERSION,
        "first_rota_date": first_rota_str,
        "start_date_discrepancy_days": start_date_discrepancy_days,
        "rows": part1 + part2,
    }

    # 11. Write to referral_checks
    now = datetime.now(tz=UTC).isoformat()
    supabase.table("referral_checks").insert({
        "referral_id": referral["id"],
        "checked_at": now,
        "query_version": QUERY_VERSION,
        "start_date_filter": start_date,
        "working_days_approved": working_days_approved,
        "working_days_projected": working_days_projected,
        "working_days_total": working_days_total,
        "threshold_met": threshold_met,
        "start_date_discrepancy_flag": start_date_discrepancy_flag,
        "check_detail": check_detail,
    }).execute()

    # 12. Update referrals table
    update_data = {
        "working_days_approved": working_days_approved,
        "working_days_projected": working_days_projected,
        "working_days_total": working_days_total,
        "last_checked_at": now,
        "last_check_snapshot": check_detail,
        "query_version": QUERY_VERSION,
    }

    if threshold_met and referral["status"] != "approved":
        update_data["status"] = "approved"
        update_data["approved_at"] = now
    elif not threshold_met:
        update_data["status"] = "not_yet_eligible"

    supabase.table("referrals").update(update_data).eq("id", referral["id"]).execute()

    # 13. Print summary
    print(f"\n  Approved days:   {working_days_approved:.1f}")
    print(f"  Projected days:  {working_days_projected:.1f}")
    print(f"  Total days:      {working_days_total:.1f}")
    print(f"  Threshold (30):  {'MET' if threshold_met else 'NOT MET'}")
    if start_date_discrepancy_flag:
        print(f"  Discrepancy:     YES ({start_date_discrepancy_days} days)")
    print(f"  Status:          {update_data.get('status', referral['status'])}")

    if part1 or part2:
        print(f"\n  {'Source':<20} {'Year':>4} {'Week':>4} {'Type':<25} {'Shifts':>6} {'Days':>6}")
        print(f"  {'-'*20} {'-'*4} {'-'*4} {'-'*25} {'-'*6} {'-'*6}")
        for r in part1 + part2:
            print(f"  {r['source']:<20} {r['year']:>4} {r['week']:>4} {r['contract_type']:<25} {r['shift_count']:>6} {r['working_days']:>6.1f}")

    final_status = update_data.get("status", referral["status"])
    return {
        "hr_code": hr_code,
        "name": referral["recruited_name"],
        "outcome": "approved" if final_status == "approved" else "not_yet_eligible",
        "working_days_total": working_days_total,
        "days_remaining": max(0, THRESHOLD_DAYS - working_days_total),
        "discrepancy": start_date_discrepancy_flag,
    }


RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
NOTIFY_FROM_EMAIL = os.environ.get("NOTIFY_FROM_EMAIL", "")
NOTIFY_TO_EMAILS = os.environ.get("NOTIFY_TO_EMAILS", "")


def send_check_email(results):
    """Send a summary email of the check run via Resend."""
    if not RESEND_API_KEY or not NOTIFY_TO_EMAILS:
        print("\n  Email not configured (RESEND_API_KEY / NOTIFY_TO_EMAILS missing). Skipping email.")
        return

    import requests

    approved = [r for r in results if r.get("outcome") == "approved"]
    not_yet = [r for r in results if r.get("outcome") == "not_yet_eligible"]
    skipped = [r for r in results if r.get("outcome") == "skipped"]
    errors = [r for r in results if r.get("outcome") == "error"]

    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    date_str = datetime.now().strftime("%d/%m/%Y")

    subject = f"Referral Check Results — {date_str} — {len(results)} checked"
    if approved:
        subject += f", {len(approved)} approved"

    lines = [
        f"Referral Check Run — {now_str}",
        f"{'=' * 50}",
        "",
        f"Checked: {len(results)}  |  Approved: {len(approved)}  |  Not yet eligible: {len(not_yet)}  |  Skipped: {len(skipped)}  |  Errors: {len(errors)}",
        "",
    ]

    if approved:
        lines.append("NEWLY APPROVED")
        lines.append("-" * 50)
        for r in approved:
            lines.append(f"  {r['hr_code']}  {r['name']:<30}  {r['working_days_total']:.1f} days")
        lines.append("")

    if not_yet:
        lines.append("NOT YET ELIGIBLE")
        lines.append("-" * 50)
        for r in not_yet:
            remaining = r.get("days_remaining", 0)
            lines.append(f"  {r['hr_code']}  {r['name']:<30}  {r['working_days_total']:.1f} days  ({remaining:.1f} remaining)")
        lines.append("")

    if skipped:
        lines.append("SKIPPED")
        lines.append("-" * 50)
        for r in skipped:
            lines.append(f"  {r['hr_code']}  {r['name']:<30}  {r.get('reason', '')}")
        lines.append("")

    if errors:
        lines.append("ERRORS")
        lines.append("-" * 50)
        for r in errors:
            lines.append(f"  {r['hr_code']}  {r.get('reason', 'Unknown error')}")
        lines.append("")

    lines.append("")
    lines.append("View full details: https://www.gsapps.co/admin")

    body = "\n".join(lines)
    recipients = [e.strip() for e in NOTIFY_TO_EMAILS.split(",")]

    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": NOTIFY_FROM_EMAIL,
                "to": recipients,
                "subject": subject,
                "text": body,
            },
        )
        if resp.status_code in (200, 201):
            print(f"\n  Email sent to {', '.join(recipients)}")
        else:
            print(f"\n  Email failed ({resp.status_code}): {resp.text}", file=sys.stderr)
    except Exception as e:
        print(f"\n  Email failed: {e}", file=sys.stderr)


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    driver = get_odbc_driver()
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={GT_DB_SERVER},{GT_DB_PORT};"
        f"DATABASE={GT_DB_NAME};"
        f"UID={GT_DB_USER};"
        f"PWD={GT_DB_PASSWORD};"
        f"TrustServerCertificate=yes;"
    )
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()

    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Connected to Greythorn DB")

    # Get current epoch
    cursor.execute(EPOCH_QUERY)
    epoch_row = cursor.fetchone()
    current_year = int(epoch_row.GtEpochYear)
    current_week = int(epoch_row.GtEpochWeek)
    print(f"Current epoch: Year {current_year}, Week {current_week}")

    # Determine HR codes to check
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        res = supabase.table("referrals").select("recruited_hr_code").neq("status", "approved").execute()
        hr_codes = [r["recruited_hr_code"] for r in res.data]
        print(f"Checking all non-approved referrals: {len(hr_codes)} found")
    elif len(sys.argv) > 1:
        hr_codes = [code.upper().strip() for code in sys.argv[1:]]
    else:
        print("Usage: python scripts/referral_check.py <HR_CODE> [HR_CODE ...] | --all")
        sys.exit(1)

    results = []
    for hr_code in hr_codes:
        try:
            result = check_referral(cursor, supabase, hr_code, current_year, current_week)
            if result:
                results.append(result)
        except Exception as e:
            print(f"\n  ERROR checking {hr_code}: {e}", file=sys.stderr)
            results.append({"hr_code": hr_code, "name": "—", "outcome": "error", "reason": str(e)})

    cursor.close()
    conn.close()

    # Send summary email
    if results:
        send_check_email(results)

    print(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] Done")


if __name__ == "__main__":
    main()
