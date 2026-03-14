"""
Greythorn Contractor Sync
Queries Greythorn MSSQL → upserts to Supabase contractors table → logs to sync_log.
Run manually: python scripts/contractor_sync.py
"""

import os
import sys
from datetime import datetime

import pyodbc
from dotenv import load_dotenv
from supabase import create_client

# Load .env from scripts/ directory
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GT_DB_SERVER = os.environ["GT_DB_SERVER"]
GT_DB_NAME = os.environ["GT_DB_NAME"]
GT_DB_USER = os.environ["GT_DB_USER"]
GT_DB_PASSWORD = os.environ["GT_DB_PASSWORD"]
GT_DB_PORT = os.environ.get("GT_DB_PORT", "1433")

GREYTHORN_QUERY = """
SELECT
    c.HrCode,
    up.FirstName,
    up.LastName,
    CASE WHEN c.CurrentRecruitmentStatusId = 12 THEN 1 ELSE 0 END AS IsActive,
    CONVERT(VARCHAR(10), MAX(CAST(d.Date AS DATE)), 120) AS LastWorkedDate,
    (
        SELECT MAX(h.CreatedAt)
        FROM ContractorRecruitmentStatusHistory h
        WHERE h.ContractorId = c.ContractorId
          AND h.RecruitmentStatusId = c.CurrentRecruitmentStatusId
    ) AS StatusChangedAt
FROM Contractor c
JOIN [User] u ON u.UserId = c.UserId
JOIN UserProfile up ON up.UserId = u.UserId
LEFT JOIN Debrief d ON d.ContractorId = c.ContractorId AND d.IsApproved = 1
GROUP BY c.HrCode, up.FirstName, up.LastName, c.CurrentRecruitmentStatusId, c.ContractorId
ORDER BY c.HrCode
"""


def main():
    triggered_by = os.environ.get("SYNC_TRIGGERED_BY", "manual")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    try:
        # Connect to Greythorn SQL Server
        conn_str = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={GT_DB_SERVER},{GT_DB_PORT};"
            f"DATABASE={GT_DB_NAME};"
            f"UID={GT_DB_USER};"
            f"PWD={GT_DB_PASSWORD};"
            f"TrustServerCertificate=yes;"
        )
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()

        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Connected to Greythorn DB")
        cursor.execute(GREYTHORN_QUERY)
        rows = cursor.fetchall()
        print(f"Fetched {len(rows)} contractors from Greythorn")

        # Build upsert records
        records = []
        for row in rows:
            records.append({
                "hr_code": row.HrCode.strip(),
                "first_name": row.FirstName.strip(),
                "last_name": row.LastName.strip(),
                "is_active": bool(row.IsActive),
                "last_worked_date": row.LastWorkedDate if row.LastWorkedDate else None,
                "status_changed_at": row.StatusChangedAt.isoformat() if row.StatusChangedAt else None,
                "synced_at": datetime.now(tz=__import__('datetime').UTC).isoformat(),
            })

        # Upsert to Supabase in batches
        BATCH_SIZE = 500
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            supabase.table("contractors").upsert(
                batch, on_conflict="hr_code"
            ).execute()
            print(f"  Upserted batch {i // BATCH_SIZE + 1} ({len(batch)} records)")

        # Log success
        supabase.table("sync_log").insert({
            "status": "success",
            "records_synced": len(records),
            "triggered_by": triggered_by,
        }).execute()

        print(f"Sync complete: {len(records)} contractors upserted")

        cursor.close()
        conn.close()

    except Exception as e:
        # Log error
        try:
            supabase.table("sync_log").insert({
                "status": "error",
                "error_message": str(e),
                "triggered_by": triggered_by,
            }).execute()
        except Exception as log_err:
            print(f"Failed to log error to sync_log: {log_err}", file=sys.stderr)

        print(f"Sync failed: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
