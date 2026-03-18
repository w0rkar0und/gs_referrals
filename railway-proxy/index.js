const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json());

// ── SQL Server connection config ──
const dbConfig = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

// ── Secret validation middleware ──
function validateSecret(req, res, next) {
  const secret = req.headers['x-report-secret'];
  if (!secret || secret !== process.env.PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ── Health check (no auth required) ──
app.get('/health', async (req, res) => {
  try {
    const p = await getPool();
    await p.request().query('SELECT 1 AS ok');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ── All report routes require secret ──
app.use('/report', validateSecret);

// ── Deposit Report ──
app.post('/report/deposit', async (req, res) => {
  const { hrCode } = req.body;
  if (!hrCode) return res.status(400).json({ error: 'hrCode is required' });

  try {
    const p = await getPool();

    // Contractor lookup
    const contractorResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT c.ContractorId, c.HrCode,
               up.FirstName, up.LastName, up.Email, up.PhoneNumber
        FROM Contractor c
        JOIN [User] u ON u.UserId = c.UserId
        JOIN UserProfile up ON up.UserId = u.UserId
        WHERE c.HrCode = @HrCode
      `);

    const contractor = contractorResult.recordset[0] || null;
    if (!contractor) {
      return res.json({ contractor: null, deposit: null, transactions: [], vehicles: [], charges: [], depositReturns: [] });
    }

    // Section 1A: Resolve last deposit ID (split query — no JOINs, no bit/numeric columns)
    const depositIdResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT TOP 1 ContractorVehicleDepositId
        FROM ContractorVehicleDeposit
        WHERE ContractorId = (
            SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode
        )
        ORDER BY ContractorVehicleDepositId DESC
      `);

    let deposit = null;
    let transactions = [];
    const lastDepositId = depositIdResult.recordset[0]?.ContractorVehicleDepositId ?? null;

    if (lastDepositId) {
      // Section 1B: Full deposit details (by primary key)
      const depositResult = await p.request()
        .input('LastDepositId', sql.Int, lastDepositId)
        .query(`
          SELECT
              d.ContractorVehicleDepositId,
              CAST(d.DepositAmount AS FLOAT)             AS DepositAmount,
              d.DepositWeeks,
              CONVERT(VARCHAR, d.IsDeleted)              AS IsCancelled,
              CONVERT(VARCHAR, d.CreatedAt, 103)         AS CreatedDate,
              CONVERT(VARCHAR, d.UpdatedAt, 103)         AS UpdatedDate,
              CONVERT(VARCHAR, d.DeletedAt, 103)         AS CancelledDate,
              cu.FirstName + ' ' + cu.LastName           AS CreatedBy,
              uu.FirstName + ' ' + uu.LastName           AS UpdatedBy,
              du.FirstName + ' ' + du.LastName           AS CancelledBy
          FROM ContractorVehicleDeposit d
          LEFT JOIN [User] cbu ON cbu.UserId = d.CreatedBy
          LEFT JOIN UserProfile cu  ON cu.UserId  = cbu.UserId
          LEFT JOIN [User] ubu ON ubu.UserId = d.UpdatedBy
          LEFT JOIN UserProfile uu  ON uu.UserId  = ubu.UserId
          LEFT JOIN [User] dbu ON dbu.UserId = d.DeletedBy
          LEFT JOIN UserProfile du  ON du.UserId  = dbu.UserId
          WHERE d.ContractorVehicleDepositId = @LastDepositId
        `);
      deposit = depositResult.recordset[0] || null;

      // Section 1C: Transactions on last deposit (active only)
      const txResult = await p.request()
        .input('LastDepositId', sql.Int, lastDepositId)
        .query(`
          SELECT
              t.ContractorVehicleDepositTransactionId,
              CAST(t.Amount AS FLOAT)                    AS Amount,
              CONVERT(VARCHAR, t.CreatedAt, 103)         AS Date,
              cu.FirstName + ' ' + cu.LastName           AS CreatedBy
          FROM ContractorVehicleDepositTransaction t
          LEFT JOIN [User] cbu ON cbu.UserId = t.CreatedBy
          LEFT JOIN UserProfile cu  ON cu.UserId  = cbu.UserId
          WHERE t.ContractorVehicleDepositId = @LastDepositId
            AND t.IsDeleted = 0
          ORDER BY t.CreatedAt
        `);
      transactions = txResult.recordset;
    }

    // Section 2: Vehicle Usage History
    const vehiclesResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
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
      `);

    // Section 3: Vehicle Charges
    const chargesResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
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
      `);

    // Section 4: Deposit Return Audit
    const depositReturnResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT
          CAST(cap.Amount AS FLOAT) AS Amount,
          CONVERT(VARCHAR, cap.Date, 103) AS Date,
          cap.IsDeleted,
          cup.FirstName + ' ' + cup.LastName AS CreatedBy,
          CONVERT(VARCHAR, cap.CreatedAt, 103) AS CreatedDate
        FROM ContractorAdditionalPay cap
        JOIN Contractor c ON c.ContractorId = cap.ContractorId
        LEFT JOIN [User] cu ON cu.UserId = cap.CreatedBy
        LEFT JOIN UserProfile cup ON cup.UserId = cu.UserId
        WHERE c.HrCode = @HrCode
          AND cap.ContractorAdditionalPayReasonId = 7
          AND cap.IsDeleted = 0
        ORDER BY cap.Date DESC
      `);

    res.json({
      contractor,
      deposit,
      transactions,
      vehicles: vehiclesResult.recordset,
      charges: chargesResult.recordset,
      depositReturns: depositReturnResult.recordset,
    });
  } catch (err) {
    console.error('Deposit report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Working Day Count Report ──
app.post('/report/working-days', async (req, res) => {
  const { hrCode } = req.body;
  if (!hrCode) return res.status(400).json({ error: 'hrCode is required' });

  try {
    const p = await getPool();

    // Resolve current Greythorn epoch week
    const calResult = await p.request().query(`
      SELECT GtEpochYear, GtEpochWeek
      FROM Calendar
      WHERE Date = CAST(GETDATE() AS DATE)
    `);
    const { GtEpochYear: currentYear, GtEpochWeek: currentWeek } = calResult.recordset[0];

    // Contractor lookup
    const contractorResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT c.ContractorId, c.HrCode,
               up.FirstName, up.LastName
        FROM Contractor c
        JOIN [User] u ON u.UserId = c.UserId
        JOIN UserProfile up ON up.UserId = u.UserId
        WHERE c.HrCode = @HrCode
      `);

    // Part 1: Approved debriefs
    const approvedResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
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
      `);

    // Part 2: Current week rota projection
    const rotaResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .input('CurrentYear', sql.Int, currentYear)
      .input('CurrentWeek', sql.Int, currentWeek)
      .query(`
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
      `);

    res.json({
      contractor: contractorResult.recordset[0] || null,
      currentEpoch: { year: currentYear, week: currentWeek },
      approved: approvedResult.recordset,
      projected: rotaResult.recordset,
    });
  } catch (err) {
    console.error('Working days report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Working Days by Client Report ──
app.post('/report/working-days-by-client', async (req, res) => {
  try {
    const p = await getPool();

    // Resolve target epoch year/week (last completed week)
    const epochResult = await p.request().query(`
      SELECT
        CASE WHEN GtEpochWeek = 1 THEN GtEpochYear - 1 ELSE GtEpochYear END AS TargetYear,
        CASE WHEN GtEpochWeek = 1
             THEN (SELECT MAX(GtEpochWeek) FROM Calendar WHERE GtEpochYear = (SELECT GtEpochYear - 1 FROM Calendar WHERE Date = CAST(GETDATE() AS DATE)))
             ELSE GtEpochWeek - 1 END AS TargetWeek
      FROM Calendar WHERE Date = CAST(GETDATE() AS DATE)
    `);
    const { TargetYear, TargetWeek } = epochResult.recordset[0];

    // Main query: working day counts by client/branch/contract type
    const result = await p.request().query(`
      SELECT
          CONVERT(VARCHAR(50), cl.ClientName)       AS ClientName,
          CONVERT(VARCHAR(50), b.BranchName)        AS BranchName,
          CONVERT(VARCHAR(50), b.BranchAlias)       AS BranchAlias,
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
          )) OVER (PARTITION BY cl.ClientName, b.BranchName, b.BranchAlias) AS SiteTotal
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
      GROUP BY cl.ClientName, b.BranchName, b.BranchAlias, ct.ContractTypeName
      ORDER BY cl.ClientName, b.BranchName, b.BranchAlias, ct.ContractTypeName
    `);

    res.json({
      targetEpoch: { year: TargetYear, week: TargetWeek },
      rows: result.recordset,
    });
  } catch (err) {
    console.error('Working days by client report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DA Relations Settlement Data ──
app.post('/report/settlement', async (req, res) => {
  const { hrCode } = req.body;
  if (!hrCode) return res.status(400).json({ error: 'hrCode is required' });

  try {
    const p = await getPool();

    // Contractor lookup
    const contractorResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT c.ContractorId, c.HrCode,
               up.FirstName, up.LastName, up.Email, up.PhoneNumber
        FROM Contractor c
        JOIN [User] u ON u.UserId = c.UserId
        JOIN UserProfile up ON up.UserId = u.UserId
        WHERE c.HrCode = @HrCode
      `);

    const contractor = contractorResult.recordset[0] || null;
    if (!contractor) {
      return res.json({ contractor: null, accountStatus: null, deposit: null, transactions: [], vehicles: [], charges: [], remittances: [] });
    }

    // Account status: current status and last change details
    const statusResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT TOP 1
            h.Active,
            CONVERT(VARCHAR, h.CreatedAt, 103) AS StatusDate,
            up.FirstName + ' ' + up.LastName AS ChangedBy
        FROM ContractorAccountStatusHistory h
        LEFT JOIN [User] u ON u.UserId = h.CreatedBy
        LEFT JOIN UserProfile up ON up.UserId = u.UserId
        WHERE h.ContractorId = (SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode)
        ORDER BY h.CreatedAt DESC
      `);
    const accountStatus = statusResult.recordset[0] || null;

    // Part 1A: Resolve last deposit ID (no JOINs, no bit/numeric columns)
    const depositIdResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT TOP 1 ContractorVehicleDepositId
        FROM ContractorVehicleDeposit
        WHERE ContractorId = (
            SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode
        )
        ORDER BY ContractorVehicleDepositId DESC
      `);

    let deposit = null;
    let transactions = [];
    let vehicles = [];
    const lastDepositId = depositIdResult.recordset[0]?.ContractorVehicleDepositId ?? null;

    if (lastDepositId) {
      // Part 1B: Full deposit details (by primary key)
      const depositResult = await p.request()
        .input('LastDepositId', sql.Int, lastDepositId)
        .query(`
          SELECT
              d.ContractorVehicleDepositId,
              CAST(d.DepositAmount AS FLOAT)             AS DepositAmount,
              d.DepositWeeks,
              CONVERT(VARCHAR, d.IsDeleted)              AS IsCancelled,
              CONVERT(VARCHAR, d.CreatedAt, 103)         AS CreatedDate,
              CONVERT(VARCHAR, d.UpdatedAt, 103)         AS UpdatedDate,
              CONVERT(VARCHAR, d.DeletedAt, 103)         AS DeletedDate,
              cu.FirstName + ' ' + cu.LastName           AS CreatedBy,
              uu.FirstName + ' ' + uu.LastName           AS UpdatedBy,
              du.FirstName + ' ' + du.LastName           AS DeletedBy
          FROM ContractorVehicleDeposit d
          LEFT JOIN [User] cbu ON cbu.UserId = d.CreatedBy
          LEFT JOIN UserProfile cu  ON cu.UserId  = cbu.UserId
          LEFT JOIN [User] ubu ON ubu.UserId = d.UpdatedBy
          LEFT JOIN UserProfile uu  ON uu.UserId  = ubu.UserId
          LEFT JOIN [User] dbu ON dbu.UserId = d.DeletedBy
          LEFT JOIN UserProfile du  ON du.UserId  = dbu.UserId
          WHERE d.ContractorVehicleDepositId = @LastDepositId
        `);
      deposit = depositResult.recordset[0] || null;

      // Part 2: Deposit transactions (active only, on last deposit)
      const txResult = await p.request()
        .input('LastDepositId', sql.Int, lastDepositId)
        .query(`
          SELECT
              t.ContractorVehicleDepositTransactionId,
              CAST(t.Amount AS FLOAT)                    AS Amount,
              CONVERT(VARCHAR, t.CreatedAt, 103)         AS Date,
              cu.FirstName + ' ' + cu.LastName           AS CreatedBy
          FROM ContractorVehicleDepositTransaction t
          LEFT JOIN [User] cbu ON cbu.UserId = t.CreatedBy
          LEFT JOIN UserProfile cu  ON cu.UserId  = cbu.UserId
          WHERE t.ContractorVehicleDepositId = @LastDepositId
            AND t.IsDeleted = 0
          ORDER BY t.CreatedAt
        `);
      transactions = txResult.recordset;

      // Vehicles assigned since the deposit creation date
      const depositDateResult = await p.request()
        .input('LastDepositId2', sql.Int, lastDepositId)
        .query(`SELECT CAST(CreatedAt AS DATE) AS DepositCreatedDate FROM ContractorVehicleDeposit WHERE ContractorVehicleDepositId = @LastDepositId2`);

      const depositCreatedDate = depositDateResult.recordset[0]?.DepositCreatedDate ?? null;

      if (depositCreatedDate) {
        const vehicleResult = await p.request()
          .input('HrCode', sql.VarChar, hrCode)
          .input('DepositCreatedDate', sql.Date, depositCreatedDate)
          .query(`
            SELECT
                v.RegistrationNumber                        AS VRM,
                vmk.VehicleMakeName                         AS Make,
                vmd.VehicleModelName                        AS Model,
                vs.VehicleSupplierName                      AS Supplier,
                vot.VehicleOwnershipTypeName                AS OwnershipType,
                CONVERT(VARCHAR, vot.IsOwnedByContractor)   AS IsOwnedByContractor,
                CONVERT(VARCHAR, cv.FromDate, 103)          AS FromDate,
                CONVERT(VARCHAR, cv.ToDate, 103)            AS ToDate
            FROM ContractorVehicle cv
            JOIN Vehicle v           ON v.VehicleId           = cv.VehicleId
            LEFT JOIN VehicleModel vmd ON vmd.VehicleModelId  = v.VehicleModelId
            LEFT JOIN VehicleMake vmk  ON vmk.VehicleMakeId   = vmd.VehicleMakeId
            JOIN VehicleSupplier vs  ON vs.VehicleSupplierId  = v.VehicleSupplierId
            LEFT JOIN VehicleOwnershipType vot ON vot.VehicleOwnershipTypeId = v.VehicleOwnershipTypeId
            WHERE cv.ContractorId = (SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode)
              AND (cv.ToDate IS NULL OR CAST(cv.ToDate AS DATE) >= @DepositCreatedDate)
              AND CAST(cv.FromDate AS DATE) <= GETDATE()
            ORDER BY cv.FromDate
          `);
        vehicles = vehicleResult.recordset;
      }
    }

    // Part 3: Vehicle charges (independent of deposit)
    const chargesResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT
            CONVERT(VARCHAR(20), v.RegistrationNumber)       AS VRM,
            CONVERT(VARCHAR(30), vcr.VehicleChargeReasonName) AS Reason,
            CONVERT(VARCHAR(50), vc.Reference)               AS Reference,
            CONVERT(VARCHAR, vc.IssueDate, 103)              AS IssueDate,
            CAST(vc.Amount AS FLOAT)                         AS Charged,
            ISNULL(p.TotalPaid, 0)                           AS Paid,
            ROUND(
                CAST(vc.Amount AS FLOAT) - ISNULL(p.TotalPaid, 0),
            2)                                               AS Outstanding
        FROM VehicleCharge vc
        JOIN Vehicle v           ON v.VehicleId             = vc.VehicleId
        JOIN VehicleChargeReason vcr ON vcr.VehicleChargeReasonId = vc.VehicleChargeReasonId
        JOIN ContractorVehicle cv
            ON  cv.VehicleId     = vc.VehicleId
            AND cv.ContractorId  = (SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode)
            AND vc.IssueDate    >= CAST(cv.FromDate AS DATE)
            AND vc.IssueDate    <= ISNULL(CAST(cv.ToDate AS DATE), GETDATE())
        LEFT JOIN (
            SELECT VehicleChargeId, SUM(CAST(Amount AS FLOAT)) AS TotalPaid
            FROM VehicleChargeTransaction
            WHERE IsDeleted = 0
            GROUP BY VehicleChargeId
        ) p ON p.VehicleChargeId = vc.VehicleChargeId
        WHERE vc.IsDeleted = 0
          AND v.VehicleSupplierId = 2
        ORDER BY vc.IssueDate
      `);

    // Part 4: Last two remittance notices (independent of deposit)
    const remittancesResult = await p.request()
      .input('HrCode', sql.VarChar, hrCode)
      .query(`
        SELECT TOP 2
            rn.Year,
            rn.Week,
            CAST(rn.DebriefAmount       AS FLOAT) AS DebriefAmount,
            CAST(rn.AdditionalPayAmount AS FLOAT) AS AdditionalPayAmount,
            CAST(rn.DeductionsAmount    AS FLOAT) AS DeductionsAmount,
            CAST(rn.DebriefAmount       AS FLOAT)
                + CAST(rn.AdditionalPayAmount AS FLOAT)
                - CAST(rn.DeductionsAmount    AS FLOAT) AS TotalPay
        FROM RemittanceNotice rn
        WHERE rn.ContractorId = (
            SELECT ContractorId FROM Contractor WHERE HrCode = @HrCode
        )
          AND rn.IsDeleted = 0
        ORDER BY rn.Year DESC, rn.Week DESC
      `);

    res.json({
      contractor,
      accountStatus,
      deposit,
      transactions,
      vehicles,
      charges: chargesResult.recordset,
      remittances: remittancesResult.recordset,
    });
  } catch (err) {
    console.error('Settlement report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Report proxy listening on port ${PORT}`);
});
