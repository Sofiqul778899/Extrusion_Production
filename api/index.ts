import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'node:url';
import * as XLSX from "xlsx";
import { query, initializeDatabase, isFallbackMode, isMSSQL } from "./db.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error]", err);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message,
      path: req.path
    });
  }
});

// Helper for wrapping route handlers with error catching
const safeHandler = (fn: (req: any, res: any) => Promise<void>) => async (req: any, res: any, next: any) => {
  try {
    await fn(req, res);
  } catch (err: any) {
    console.error(`[Route Error] ${req.method} ${req.path}:`, err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: err.message,
      path: req.path
    });
  }
};

// --- Dropdowns default options if database config is empty ---
const DEFAULT_DROPDOWNS = {
  shifts: ['Day', 'Night', 'A', 'B', 'C'],
  productionTypes: ['Commercial', 'R&D', 'Trial', 'Sample'],
  uoms: ['Kgs', 'Rolls', 'Meter', 'INCH'],
  materials: ['LDPE', 'HDPE', 'LLDPE', 'PP', 'BOPP'],
  inlinePrintOptions: ['Yes', 'No'],
  years: ['2023', '2024', '2025', '2026', '2027'],
  breakdownReasons: ['Mechanical', 'Electrical', 'Pneumatic', 'Hydraulic', 'Sensor Failure', 'Heater Band Burnout'],
  idleReasons: ['No Material', 'No Operator', 'Power Interruption', 'Core Shortage', 'Routine Clean-up', 'Awaiting Maintenance Handover']
};

// --- Utilities ---
export function cleanPi(pi: string): string {
  if (!pi) return '';
  let str = pi.trim().toLowerCase();
  str = str.replace(/^mpbl\s*[\/\-_]?\s*/, '');
  str = str.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
  str = str.replace(/[^a-z0-9]/g, '');
  return str;
}

export function getMatchedDetails(piDetailsList: any[], piVal: string): { retailer: string, customer: string } {
  if (!piVal || !piDetailsList || piDetailsList.length === 0) return { retailer: '', customer: '' };
  
  const upper = piVal.trim().toUpperCase();
  const matchedExact = piDetailsList.find(d => d.pi_number.toUpperCase() === upper);
  if (matchedExact) {
    return { retailer: matchedExact.retailer || '', customer: matchedExact.customer || '' };
  }
  
  const cleanTarget = cleanPi(piVal);
  const matchedClean = piDetailsList.find(d => cleanPi(d.pi_number) === cleanTarget);
  if (matchedClean) {
    return { retailer: matchedClean.retailer || '', customer: matchedClean.customer || '' };
  }
  
  const baseMatch = piVal.match(/MPBL\/0*(\d+)/i) || piVal.match(/0*(\d+)/);
  if (baseMatch) {
    const base = baseMatch[1];
    const matchedBase = piDetailsList.find(d => {
      const dbBaseMatch = d.pi_number.match(/MPBL\/0*(\d+)/i) || d.pi_number.match(/0*(\d+)/);
      return dbBaseMatch && dbBaseMatch[1] === base;
    });
    if (matchedBase) {
      return { retailer: matchedBase.retailer || '', customer: matchedBase.customer || '' };
    }
  }
  
  return { retailer: '', customer: '' };
}

export async function getPendingOrderDetailsByPi(piNumber: string): Promise<{ retailer: string, customer: string }> {
  try {
    const res = await query('SELECT pi_number, retailer, customer FROM pending_orders');
    return getMatchedDetails(res.rows, piNumber);
  } catch (err: any) {
    console.error("Error retrieving pending order details by PI:", err.message);
    return { retailer: '', customer: '' };
  }
}

function getShiftAndDateForDhaka(date: Date = new Date()): { productionDate: string, shift: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    parts.forEach(p => {
      partMap[p.type] = p.value;
    });
    
    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10) - 1;
    const day = parseInt(partMap.day, 10);
    const hour = parseInt(partMap.hour, 10);
    
    const dhakaTime = new Date(year, month, day, hour, parseInt(partMap.minute || "0", 10));
    let productionDate = new Date(dhakaTime.getTime());
    let shift = 'Day';
    
    if (hour < 8) {
      productionDate.setDate(productionDate.getDate() - 1);
      shift = 'Night';
    } else if (hour >= 8 && hour < 20) {
      shift = 'Day';
    } else {
      shift = 'Night';
    }
    
    const yyyy = productionDate.getFullYear();
    const mm = String(productionDate.getMonth() + 1).padStart(2, '0');
    const dd = String(productionDate.getDate()).padStart(2, '0');
    
    return {
      productionDate: `${yyyy}-${mm}-${dd}`,
      shift
    };
  } catch (err) {
    const hour = date.getHours();
    let productionDate = new Date(date.getTime());
    let shift = 'Day';
    if (hour < 8) {
      productionDate.setDate(productionDate.getDate() - 1);
      shift = 'Night';
    } else if (hour >= 8 && hour < 20) {
      shift = 'Day';
    } else {
      shift = 'Night';
    }
    const yyyy = productionDate.getFullYear();
    const mm = String(productionDate.getMonth() + 1).padStart(2, '0');
    const dd = String(productionDate.getDate()).padStart(2, '0');
    return {
      productionDate: `${yyyy}-${mm}-${dd}`,
      shift
    };
  }
}

const formatPINumber = (pi: any, year: any, isSample: boolean = false): string => {
  if (!pi) return '';
  const piStr = String(pi).trim();
  const prefix = isSample ? 'SMPL' : 'MPBL';
  const yearStr = String(year || new Date().getFullYear()).trim();

  const regex = /^(mpbl|smpl)\/(\d+)\/(\d{4})$/i;
  const match = piStr.match(regex);
  if (match) {
    const rawDigits = match[2];
    const matchYear = match[3];
    return `${prefix}/${rawDigits.padStart(5, '0')}/${matchYear}`;
  }

  if (/^\d+$/.test(piStr)) {
    return `${prefix}/${piStr.padStart(5, '0')}/${yearStr}`;
  }

  const onlyDigits = piStr.replace(/\D/g, '');
  if (onlyDigits) {
    return `${prefix}/${onlyDigits.padStart(5, '0')}/${yearStr}`;
  }

  return piStr.toUpperCase();
};

const getRollSettings = async () => {
  const res = await query("SELECT config_value FROM app_config WHERE config_key = 'roll_settings'");
  if (res.rows.length > 0) {
    return res.rows[0].config_value;
  }
  return { LAST_ROLL_NO: 17413, PREFIX: "R", CURRENT_YEAR: "26" };
};

const calculateNextRollId = async () => {
  const settings = await getRollSettings();
  let lastNo = settings.LAST_ROLL_NO || 0;
  return `${settings.PREFIX}-${lastNo + 1}-${settings.CURRENT_YEAR}`;
};

const calculateNextSamplePI = async (yearStr: string) => {
  const res = await query("SELECT config_value FROM app_config WHERE config_key = 'sample_settings'");
  let nextSerial = 1;
  if (res.rows.length > 0) {
    nextSerial = (res.rows[0].config_value.LAST_SAMPLE_SERIAL || 0) + 1;
  } else {
    const sampleQuery = await query("SELECT pi_number FROM production_records WHERE production_type = 'Sample'");
    let maxSerial = 0;
    sampleQuery.rows.forEach(row => {
      const pi = row.pi_number;
      if (pi && typeof pi === 'string' && pi.toUpperCase().startsWith('SMPL/')) {
        const parts = pi.split('/');
        if (parts.length >= 2) {
          const serialNum = parseInt(parts[1], 10);
          if (!isNaN(serialNum) && serialNum > maxSerial) {
            maxSerial = serialNum;
          }
        }
      }
    });
    nextSerial = maxSerial + 1;
  }
  const padded = String(nextSerial).padStart(5, '0');
  return `SMPL/${padded}/${yearStr}`;
};

// --- ENDPOINTS ---

// Diag / Debug
app.get("/api/diag", safeHandler(async (req, res) => {
  let dbOk = false;
  try {
    await query("SELECT 1");
    dbOk = true;
  } catch (e) {}

  res.json({
    status: "online",
    database: isFallbackMode ? "Fallback (Local File DB)" : (dbOk ? "PostgreSQL Connected" : "Connection Error"),
    env_keys: Object.keys(process.env).filter(k => !k.includes("KEY") && !k.includes("PASS")),
    cwd: process.cwd()
  });
}));

app.get("/api/health", safeHandler(async (req, res) => {
  let dbStatus = "Checking...";
  try {
    await query("SELECT NOW()");
    dbStatus = "Connected & Querying";
  } catch (err: any) {
    dbStatus = "Error: " + err.message;
  }

  res.json({ 
    status: "ok", 
    time: new Date().toISOString(), 
    databaseStatus: isFallbackMode ? "Connected (Local Fallback DB)" : dbStatus
  });
}));

// Master Store / Dropdowns
app.get("/api/master-store", safeHandler(async (req, res) => {
  const tableKeys = {
    shifts: 'ref_shifts',
    productionTypes: 'ref_production_types',
    uoms: 'ref_uoms',
    materials: 'ref_materials',
    inlinePrintOptions: 'ref_inline_print_options',
    years: 'ref_years',
    breakdownReasons: 'ref_breakdown_reasons',
    idleReasons: 'ref_idle_reasons'
  };

  const store: any = {};
  
  for (const [key, table] of Object.entries(tableKeys)) {
    try {
      const result = await query(`SELECT val FROM ${table} ORDER BY id ASC`);
      store[key] = result.rows.map(r => r.val);
    } catch (err: any) {
      console.warn(`Failed to fetch from ${table}, using default/fallback:`, err.message);
      store[key] = DEFAULT_DROPDOWNS[key as keyof typeof DEFAULT_DROPDOWNS];
    }
  }

  // Ensure all keys are populated (if empty in table)
  for (const key of Object.keys(DEFAULT_DROPDOWNS)) {
    if (!store[key] || store[key].length === 0) {
      store[key] = DEFAULT_DROPDOWNS[key as keyof typeof DEFAULT_DROPDOWNS];
    }
  }

  res.json(store);
}));

app.post("/api/master-store", safeHandler(async (req, res) => {
  const masterStore = req.body;
  const tableKeys = {
    shifts: 'ref_shifts',
    productionTypes: 'ref_production_types',
    uoms: 'ref_uoms',
    materials: 'ref_materials',
    inlinePrintOptions: 'ref_inline_print_options',
    years: 'ref_years',
    breakdownReasons: 'ref_breakdown_reasons',
    idleReasons: 'ref_idle_reasons'
  };

  for (const [key, table] of Object.entries(tableKeys)) {
    const items = masterStore[key];
    if (Array.isArray(items)) {
      try {
        // Clear old entries
        await query(`DELETE FROM ${table}`);
        
        // Insert new entries
        for (const item of items) {
          if (item && typeof item === 'string' && item.trim() !== '') {
            await query(`INSERT INTO ${table} (val) VALUES ($1)`, [item.trim()]);
          }
        }
      } catch (err: any) {
        console.error(`Error updating table ${table}:`, err.message);
      }
    }
  }

  // Also keep app_config in sync as fallback
  try {
    if (isMSSQL) {
      await query(
        `IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'dropdowns')
           UPDATE dbo.app_config SET config_value = $1 WHERE config_key = 'dropdowns'
         ELSE
           INSERT INTO dbo.app_config (config_key, config_value) VALUES ('dropdowns', $1);`,
        [JSON.stringify(masterStore)]
      );
    } else {
      await query(
        `INSERT INTO app_config (config_key, config_value) 
         VALUES ('dropdowns', $1) 
         ON CONFLICT (config_key) 
         DO UPDATE SET config_value = EXCLUDED.config_value`,
        [JSON.stringify(masterStore)]
      );
    }
  } catch (e: any) {
    console.warn("Could not sync app_config 'dropdowns' key:", e.message);
  }

  res.json({ message: "Master Store updated successfully", masterStore });
}));

// Operators
app.get("/api/operators", safeHandler(async (req, res) => {
  const result = await query("SELECT operator_id AS id, name, email FROM operators ORDER BY name ASC");
  res.json(result.rows);
}));

app.post("/api/operators", safeHandler(async (req, res) => {
  const { id, name, email } = req.body;
  if (!id || !name) {
    return res.status(400).json({ message: "ID and Name are required" });
  }
  const operator = { id, name, email: email || "" };
  await query(
    `INSERT INTO operators (operator_id, name, email) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (operator_id) 
     DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
    [id, name, email || ""]
  );
  res.json({ message: "Operator saved successfully", operator });
}));

// Machines
app.get("/api/machines", safeHandler(async (req, res) => {
  const dateQuery = req.query.date as string;
  if (dateQuery) {
    const sql = `
      SELECT 
        m.machine_no AS id,
        m.type,
        COALESCE(s.target_kgs, m.target_kgs) AS target,
        m.status,
        m.reason,
        COALESCE(s.num_idle, m.num_idle) AS "numIdle",
        COALESCE(s.num_breakdown, m.num_breakdown) AS "numBreakdown",
        COALESCE(s.idle_time, m.idle_time) AS "idleTime",
        COALESCE(s.breakdown_time, m.breakdown_time) AS "breakdownTime",
        m.last_status_change AS "lastStatusChange"
      FROM machines m
      LEFT JOIN machine_daily_stats s 
        ON m.machine_no = s.machine_no 
        AND s.date = $1
      ORDER BY m.machine_no ASC
    `;
    const result = await query(sql, [dateQuery]);
    return res.json(result.rows);
  }

  const result = await query(`
    SELECT 
      machine_no AS id,
      type,
      target_kgs AS target,
      status,
      reason,
      num_idle AS "numIdle",
      num_breakdown AS "numBreakdown",
      idle_time AS "idleTime",
      breakdown_time AS "breakdownTime",
      last_status_change AS "lastStatusChange"
    FROM machines
    ORDER BY machine_no ASC
  `);
  res.json(result.rows);
}));

app.post("/api/machines", safeHandler(async (req, res) => {
  const { id, type, target } = req.body;
  if (!id || !type) {
    return res.status(400).json({ message: "ID and Type are required" });
  }
  
  const check = await query("SELECT machine_no FROM machines WHERE machine_no = $1", [id]);
  if (check.rows.length > 0) {
    return res.status(400).json({ message: "Machine ID already exists" });
  }

  const targetVal = Number(target) || 0;
  await query(
    `INSERT INTO machines (machine_no, type, target_kgs, status, reason, num_idle, num_breakdown, idle_time, breakdown_time, last_status_change)
     VALUES ($1, $2, $3, 'Idle', 'Initial Setup', 0, 0, 0, 0, NOW())`,
    [id, type, targetVal]
  );

  const newMachine = {
    id,
    type,
    target: targetVal,
    status: "Idle",
    reason: "Initial Setup",
    numIdle: 0,
    numBreakdown: 0,
    idleTime: 0,
    breakdownTime: 0,
    lastStatusChange: new Date().toISOString()
  };
  res.json({ message: "Machine created successfully", machine: newMachine });
}));

// Machine Status Transitions & Downtime Logging
app.post("/api/machines/status", safeHandler(async (req, res) => {
  const { id, date, status, reason, target, numIdle, numBreakdown, idleTime, breakdownTime, lastStatusChange } = req.body;
  
  const mQuery = await query("SELECT status, reason, last_status_change FROM machines WHERE machine_no = $1", [id]);
  if (mQuery.rows.length === 0) {
    return res.status(404).json({ message: "Machine not found" });
  }

  const oldMachine = mQuery.rows[0];
  const oldStatus = oldMachine.status;
  const oldReason = oldMachine.reason || '';

  const transitionTime = lastStatusChange ? new Date(lastStatusChange) : new Date();

  // 1. Update basic machine state in 'machines'
  await query(
    `UPDATE machines 
     SET status = COALESCE($2, status),
         reason = COALESCE($3, reason),
         target_kgs = COALESCE($4, target_kgs),
         last_status_change = $5
     WHERE machine_no = $1`,
    [id, status || null, reason !== undefined ? reason : null, target !== undefined ? Number(target) : null, transitionTime]
  );

  // 2. Handle Downtime Log transitions in machine_logs
  if (status && status !== oldStatus) {
    // Transitioning AWAY from downtime: finalize the ongoing log
    if (oldStatus === 'Idle' || oldStatus === 'Breakdown') {
      if (oldReason && oldReason !== "" && oldReason !== "NO_ALERTS" && oldReason !== "Initial Setup") {
        const ongoing = await query(
          "SELECT id, start_time FROM machine_logs WHERE machine_no = $1 AND end_time IS NULL LIMIT 1",
          [id]
        );
        if (ongoing.rows.length > 0) {
          const logId = ongoing.rows[0].id;
          const startTime = new Date(ongoing.rows[0].start_time);
          const elapsedMs = transitionTime.getTime() - startTime.getTime();
          const elapsedMins = Math.max(0, elapsedMs / (1000 * 60));
          
          await query(
            "UPDATE machine_logs SET end_time = $1, duration_mins = $2 WHERE id = $3",
            [transitionTime, elapsedMins, logId]
          );
        }
      }
    }

    // Transitioning INTO downtime: start a new ongoing log
    if (status === 'Idle' || status === 'Breakdown') {
      const finalReason = reason !== undefined ? reason : oldReason;
      if (finalReason && finalReason !== "" && finalReason !== "NO_ALERTS" && finalReason !== "Initial Setup") {
        await query(
          "INSERT INTO machine_logs (machine_no, status, start_time, end_time, duration_mins, reason) VALUES ($1, $2, $3, NULL, 0, $4)",
          [id, status, transitionTime, finalReason]
        );
      }
    }
  } else if (reason !== undefined && reason !== oldReason && (oldStatus === 'Idle' || oldStatus === 'Breakdown')) {
    // Remains in downtime, but reason changes
    // Finalize old reason log
    if (oldReason && oldReason !== "" && oldReason !== "NO_ALERTS" && oldReason !== "Initial Setup") {
      const ongoing = await query(
        "SELECT id, start_time FROM machine_logs WHERE machine_no = $1 AND end_time IS NULL LIMIT 1",
        [id]
      );
      if (ongoing.rows.length > 0) {
        const logId = ongoing.rows[0].id;
        const startTime = new Date(ongoing.rows[0].start_time);
        const elapsedMs = transitionTime.getTime() - startTime.getTime();
        const elapsedMins = Math.max(0, elapsedMs / (1000 * 60));
        
        await query(
          "UPDATE machine_logs SET end_time = $1, duration_mins = $2 WHERE id = $3",
          [transitionTime, elapsedMins, logId]
        );
      }
    }

    // Start new reason log
    if (reason && reason !== "" && reason !== "NO_ALERTS" && reason !== "Initial Setup") {
      await query(
        "INSERT INTO machine_logs (machine_no, status, start_time, end_time, duration_mins, reason) VALUES ($1, $2, $3, NULL, 0, $4)",
        [id, oldStatus, transitionTime, reason]
      );
    }
  }

  // 3. Update machine_daily_stats if date is present
  if (date) {
    const statsCheck = await query("SELECT id FROM machine_daily_stats WHERE machine_no = $1 AND date = $2", [id, date]);
    
    const targetVal = target !== undefined ? Number(target) : (Number(oldMachine.target_kgs) || 0);
    const nIdle = numIdle !== undefined ? Number(numIdle) : 0;
    const nBreakdown = numBreakdown !== undefined ? Number(numBreakdown) : 0;
    const iTime = idleTime !== undefined ? Number(idleTime) : 0;
    const bTime = breakdownTime !== undefined ? Number(breakdownTime) : 0;

    if (statsCheck.rows.length > 0) {
      await query(
        `UPDATE machine_daily_stats 
         SET target_kgs = COALESCE($3, target_kgs),
             num_idle = COALESCE($4, num_idle),
             num_breakdown = COALESCE($5, num_breakdown),
             idle_time = COALESCE($6, idle_time),
             breakdown_time = COALESCE($7, breakdown_time)
         WHERE machine_no = $1 AND date = $2`,
        [id, date, targetVal, nIdle, nBreakdown, iTime, bTime]
      );
    } else {
      await query(
        `INSERT INTO machine_daily_stats (machine_no, date, target_kgs, num_idle, num_breakdown, idle_time, breakdown_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, date, targetVal, nIdle, nBreakdown, iTime, bTime]
      );
    }
  }

  // 4. Return the fully updated machine row
  const sql = `
    SELECT 
      m.machine_no AS id,
      m.type,
      COALESCE(s.target_kgs, m.target_kgs) AS target,
      m.status,
      m.reason,
      COALESCE(s.num_idle, m.num_idle) AS "numIdle",
      COALESCE(s.num_breakdown, m.num_breakdown) AS "numBreakdown",
      COALESCE(s.idle_time, m.idle_time) AS "idleTime",
      COALESCE(s.breakdown_time, m.breakdown_time) AS "breakdownTime",
      m.last_status_change AS "lastStatusChange"
    FROM machines m
    LEFT JOIN machine_daily_stats s 
      ON m.machine_no = s.machine_no 
      AND s.date = $2
    WHERE m.machine_no = $1
  `;
  const result = await query(sql, [id, date || new Date().toISOString().split('T')[0]]);
  res.json({ message: "Machine updated successfully", machine: result.rows[0] });
}));

// App Settings (Roll settings & Date filter)
app.get("/api/settings", safeHandler(async (req, res) => {
  const settings = await getRollSettings();
  res.json(settings);
}));

app.get("/api/settings/date-filter", safeHandler(async (req, res) => {
  const dRes = await query("SELECT config_value FROM app_config WHERE config_key = 'date_filter'");
  if (dRes.rows.length > 0) {
    return res.json({ dateFilter: dRes.rows[0].config_value.dateFilter || "" });
  }
  res.json({ dateFilter: "" });
}));

app.post("/api/settings/date-filter", safeHandler(async (req, res) => {
  const { dateFilter } = req.body;
  await query(
    `INSERT INTO app_config (config_key, config_value) 
     VALUES ('date_filter', $1) 
     ON CONFLICT (config_key) 
     DO UPDATE SET config_value = EXCLUDED.config_value`,
    [JSON.stringify({ dateFilter })]
  );
  res.json({ message: "Date filter stored", dateFilter });
}));

// Google Sheets Disabled Stubs (Keep Client Stable)
app.get("/api/settings/google-service-account", (req, res) => {
  res.json({ email: "sql_database_active_sheets_disabled@extrusion.com" });
});

app.get("/api/settings/google-sheet-config", (req, res) => {
  res.json({ spreadsheetId: "sql_database_active" });
});

app.post("/api/settings/google-sheet-config", (req, res) => {
  res.json({ message: "Google Sheets is disabled. Using SQL Database Server only." });
});

app.post("/api/settings/test-google-sheets", (req, res) => {
  res.json({
    success: true,
    title: "SQL Database active",
    tabs: ["Local Production SQL Tables"],
    message: "App is connected directly to SQL database server. Google Sheets integration has been turned off."
  });
});

app.post("/api/sync-all-sheets", (req, res) => {
  res.json({ message: "Google Sheets is disabled. All records are stored securely in SQL Database Server." });
});

app.post("/api/sync-all-breakdown-sheets", (req, res) => {
  res.json({ message: "Google Sheets is disabled. Breakdown logs are logged directly in SQL Database." });
});

// Serializers
app.get("/api/next-roll-id", safeHandler(async (req, res) => {
  res.json({ nextId: await calculateNextRollId() });
}));

app.get("/api/next-sample-pi", safeHandler(async (req, res) => {
  const year = req.query.year ? String(req.query.year) : new Date().getFullYear().toString();
  res.json({ nextPI: await calculateNextSamplePI(year) });
}));

app.get("/api/previous-roll-id", safeHandler(async (req, res) => {
  const settings = await getRollSettings();
  let lastNo = settings.LAST_ROLL_NO || 0;
  res.json({ previousId: `${settings.PREFIX}-${lastNo}-${settings.CURRENT_YEAR}` });
}));

// Production Records
app.get("/api/production/recent", safeHandler(async (req, res) => {
  const sql = `
    SELECT 
      roll_id AS "RollID",
      production_date::text AS "ProductionDate",
      shift AS "Shift",
      production_type AS "ProductionType",
      operator_id AS "OperatorID",
      operator_name AS "OperatorName",
      machine_no AS "MachineNo",
      year AS "Year",
      pi_number AS "PINumber",
      tube_size AS "TubeSize",
      uom AS "UOM",
      material AS "Material",
      micron AS "Micron",
      in_line_print AS "InLinePrint",
      finished_meter AS "FinishedMeter",
      finished_kgs AS "FinishedKgs",
      roll_location AS "RollLocation",
      scrap_kgs AS "ScrapKgs",
      machine_status AS "MachineStatus",
      data_update_time AS "DataUpdateTime",
      fingerprint AS "Fingerprint",
      entered_by AS "EnteredBy",
      production_year AS "ProductionYear",
      production_month AS "ProductionMonth",
      retailer AS "Retailer",
      customer AS "Customer",
      entry_timestamp AS "EntryTimestamp"
    FROM production_records
    ORDER BY entry_timestamp DESC
    LIMIT 50
  `;
  const result = await query(sql);
  res.json(result.rows);
}));

app.get("/api/production", safeHandler(async (req, res) => {
  const sql = `
    SELECT 
      roll_id AS "RollID",
      production_date::text AS "ProductionDate",
      shift AS "Shift",
      production_type AS "ProductionType",
      operator_id AS "OperatorID",
      operator_name AS "OperatorName",
      machine_no AS "MachineNo",
      year AS "Year",
      pi_number AS "PINumber",
      tube_size AS "TubeSize",
      uom AS "UOM",
      material AS "Material",
      micron AS "Micron",
      in_line_print AS "InLinePrint",
      finished_meter AS "FinishedMeter",
      finished_kgs AS "FinishedKgs",
      roll_location AS "RollLocation",
      scrap_kgs AS "ScrapKgs",
      machine_status AS "MachineStatus",
      data_update_time AS "DataUpdateTime",
      fingerprint AS "Fingerprint",
      entered_by AS "EnteredBy",
      production_year AS "ProductionYear",
      production_month AS "ProductionMonth",
      retailer AS "Retailer",
      customer AS "Customer",
      entry_timestamp AS "EntryTimestamp"
    FROM production_records
    ORDER BY entry_timestamp ASC
  `;
  const result = await query(sql);
  res.json(result.rows);
}));

app.post("/api/production", safeHandler(async (req, res) => {
  const entry = req.body;
  const newRollId = await calculateNextRollId();

  // 1. Update Roll Settings LAST_ROLL_NO
  const parts = newRollId.split('-');
  if (parts.length === 3) {
    const newLastNo = parseInt(parts[1], 10);
    await query(
      `INSERT INTO app_config (config_key, config_value)
       VALUES ('roll_settings', $1)
       ON CONFLICT (config_key)
       DO UPDATE SET config_value = EXCLUDED.config_value`,
      [JSON.stringify({ LAST_ROLL_NO: newLastNo, PREFIX: parts[0], CURRENT_YEAR: parts[2] })]
    );
  }

  const date = new Date(entry.ProductionDate || new Date());
  const isSample = entry.ProductionType === 'Sample';
  const formattedPI = formatPINumber(entry.PINumber, entry.Year || date.getFullYear().toString(), isSample);

  // 2. Update Sample serials
  if (isSample) {
    const smplParts = formattedPI.split('/');
    if (smplParts.length >= 2) {
      const serialVal = parseInt(smplParts[1], 10);
      if (!isNaN(serialVal)) {
        await query(
          `INSERT INTO app_config (config_key, config_value)
           VALUES ('sample_settings', $1)
           ON CONFLICT (config_key)
           DO UPDATE SET config_value = EXCLUDED.config_value`,
          [JSON.stringify({ LAST_SAMPLE_SERIAL: serialVal })]
        );
      }
    }
  }

  // 3. Resolve Retailer and Customer from Pending Orders
  const piDetails = await getPendingOrderDetailsByPi(formattedPI);

  const entryTimestamp = new Date().toISOString();
  const dataUpdateTime = new Date().toLocaleString();
  const fingerprint = Math.random().toString(36).substring(2, 10).toUpperCase();
  const enteredBy = "Plant Admin";
  const pYear = date.getFullYear().toString();
  const pMonth = date.toLocaleString('default', { month: 'long' });

  // 4. Save Production Record
  const sql = `
    INSERT INTO production_records (
      roll_id, production_date, shift, production_type, operator_id, operator_name, machine_no,
      year, pi_number, tube_size, uom, material, micron, in_line_print, finished_meter, finished_kgs,
      roll_location, scrap_kgs, machine_status, data_update_time, fingerprint, entered_by,
      production_year, production_month, retailer, customer, entry_timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
  `;
  
  await query(sql, [
    newRollId,
    entry.ProductionDate || new Date().toISOString().split('T')[0],
    entry.Shift || 'Day',
    entry.ProductionType || 'Commercial',
    entry.OperatorID || null,
    entry.OperatorName || '',
    entry.MachineNo || null,
    entry.Year || pYear,
    formattedPI,
    entry.TubeSize || '',
    entry.UOM || 'Kgs',
    entry.Material || '',
    entry.Micron || '',
    entry.InLinePrint || 'No',
    Number(entry.FinishedMeter) || 0.00,
    Number(entry.FinishedKgs) || 0.00,
    entry.RollLocation || '',
    Number(entry.ScrapKgs) || 0.00,
    entry.MachineStatus || 'Running',
    dataUpdateTime,
    fingerprint,
    enteredBy,
    pYear,
    pMonth,
    piDetails.retailer || '',
    piDetails.customer || '',
    entryTimestamp
  ]);

  const newEntry = {
    ...entry,
    PINumber: formattedPI,
    Retailer: piDetails.retailer || '',
    Customer: piDetails.customer || '',
    RollID: newRollId,
    EntryTimestamp: entryTimestamp,
    DataUpdateTime: dataUpdateTime,
    Fingerprint: fingerprint,
    EnteredBy: enteredBy,
    ProductionYear: pYear,
    ProductionMonth: pMonth
  };

  res.status(201).json({ 
    message: "Production Entry Saved Successfully", 
    entry: newEntry 
  });
}));

app.post("/api/production/update", safeHandler(async (req, res) => {
  const { RollID, ...updates } = req.body;
  if (!RollID) {
    return res.status(400).json({ message: "RollID is required for update" });
  }

  const check = await query("SELECT * FROM production_records WHERE roll_id = $1", [RollID]);
  if (check.rows.length === 0) {
    return res.status(404).json({ message: `Production report with RollID ${RollID} not found` });
  }

  const originalData = check.rows[0];

  const checkType = updates.ProductionType || originalData.production_type;
  const isSample = checkType === 'Sample';
  
  let piToUse = updates.PINumber || originalData.pi_number || '';
  const yearToUse = updates.Year || originalData.year || new Date().getFullYear().toString();
  let formattedPI = piToUse;
  let retailerVal = originalData.retailer;
  let customerVal = originalData.customer;

  if (updates.PINumber || updates.Year || updates.ProductionType) {
    formattedPI = formatPINumber(piToUse, yearToUse, isSample);
    const piDetails = await getPendingOrderDetailsByPi(formattedPI);
    retailerVal = piDetails.retailer || '';
    customerVal = piDetails.customer || '';
    
    if (isSample) {
      const smplParts = formattedPI.split('/');
      if (smplParts.length >= 2) {
        const serialVal = parseInt(smplParts[1], 10);
        if (!isNaN(serialVal)) {
          await query(
            `INSERT INTO app_config (config_key, config_value)
             VALUES ('sample_settings', $1)
             ON CONFLICT (config_key)
             DO UPDATE SET config_value = EXCLUDED.config_value`,
            [JSON.stringify({ LAST_SAMPLE_SERIAL: serialVal })]
          );
        }
      }
    }
  }

  let pYear = originalData.production_year;
  let pMonth = originalData.production_month;
  if (updates.ProductionDate) {
    const date = new Date(updates.ProductionDate);
    pYear = date.getFullYear().toString();
    pMonth = date.toLocaleString('default', { month: 'long' });
  }

  const dataUpdateTime = new Date().toLocaleString();

  const sql = `
    UPDATE production_records
    SET production_date = COALESCE($2, production_date),
        shift = COALESCE($3, shift),
        production_type = COALESCE($4, production_type),
        operator_id = COALESCE($5, operator_id),
        operator_name = COALESCE($6, operator_name),
        machine_no = COALESCE($7, machine_no),
        year = COALESCE($8, year),
        pi_number = COALESCE($9, pi_number),
        tube_size = COALESCE($10, tube_size),
        uom = COALESCE($11, uom),
        material = COALESCE($12, material),
        micron = COALESCE($13, micron),
        in_line_print = COALESCE($14, in_line_print),
        finished_meter = COALESCE($15, finished_meter),
        finished_kgs = COALESCE($16, finished_kgs),
        roll_location = COALESCE($17, roll_location),
        scrap_kgs = COALESCE($18, scrap_kgs),
        machine_status = COALESCE($19, machine_status),
        data_update_time = $20,
        production_year = $21,
        production_month = $22,
        retailer = $23,
        customer = $24
    WHERE roll_id = $1
  `;

  await query(sql, [
    RollID,
    updates.ProductionDate || null,
    updates.Shift || null,
    updates.ProductionType || null,
    updates.OperatorID || null,
    updates.OperatorName || null,
    updates.MachineNo || null,
    updates.Year || null,
    formattedPI,
    updates.TubeSize || null,
    updates.UOM || null,
    updates.Material || null,
    updates.Micron || null,
    updates.InLinePrint || null,
    updates.FinishedMeter !== undefined ? Number(updates.FinishedMeter) : null,
    updates.FinishedKgs !== undefined ? Number(updates.FinishedKgs) : null,
    updates.RollLocation || null,
    updates.ScrapKgs !== undefined ? Number(updates.ScrapKgs) : null,
    updates.MachineStatus || null,
    dataUpdateTime,
    pYear,
    pMonth,
    retailerVal,
    customerVal
  ]);

  res.json({ message: "Production entry updated successfully" });
}));

app.post("/api/production/bulk", safeHandler(async (req, res) => {
  const entries = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ message: "Payload must be an array of entries" });
  }

  const normalizeDate = (dateStr: string | number) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'number') {
      const d = new Date((dateStr - (25567 + 2)) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    const str = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    } catch (e) {}
    return str;
  };

  let lastRollNo = 0;

  for (const entry of entries) {
    let rollId = entry.RollID;
    if (!rollId) {
      rollId = `EXT-IMPORTED-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    } else {
      const parts = rollId.split('-');
      if (parts.length === 3) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > lastRollNo) {
          lastRollNo = num;
        }
      }
    }

    const pDate = normalizeDate(entry.ProductionDate);
    const dateObj = pDate ? new Date(pDate) : new Date();
    const pYear = dateObj.getFullYear().toString();
    const pMonth = dateObj.toLocaleString('default', { month: 'long' });

    await query(
      `INSERT INTO production_records (
        roll_id, production_date, shift, production_type, operator_id, operator_name, machine_no,
        year, pi_number, tube_size, uom, material, micron, in_line_print, finished_meter, finished_kgs,
        roll_location, scrap_kgs, machine_status, data_update_time, fingerprint, entered_by,
        production_year, production_month, retailer, customer, entry_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      ON CONFLICT (roll_id) DO UPDATE SET
        production_date = EXCLUDED.production_date,
        shift = EXCLUDED.shift,
        production_type = EXCLUDED.production_type,
        operator_name = EXCLUDED.operator_name,
        machine_no = EXCLUDED.machine_no,
        finished_meter = EXCLUDED.finished_meter,
        finished_kgs = EXCLUDED.finished_kgs,
        scrap_kgs = EXCLUDED.scrap_kgs,
        retailer = EXCLUDED.retailer,
        customer = EXCLUDED.customer`,
      [
        rollId,
        pDate || new Date().toISOString().split('T')[0],
        entry.Shift || 'Day',
        entry.ProductionType || 'Commercial',
        entry.OperatorID || null,
        entry.OperatorName || '',
        entry.MachineNo || null,
        entry.Year || pYear,
        entry.PINumber || '',
        entry.TubeSize || '',
        entry.UOM || 'Kgs',
        entry.Material || '',
        entry.Micron || '',
        entry.InLinePrint || 'No',
        Number(entry.FinishedMeter) || 0.00,
        Number(entry.FinishedKgs) || 0.00,
        entry.RollLocation || '',
        Number(entry.ScrapKgs) || 0.00,
        entry.MachineStatus || 'Running',
        entry.DataUpdateTime || new Date().toLocaleString(),
        entry.Fingerprint || Math.random().toString(36).substring(2, 10).toUpperCase(),
        entry.EnteredBy || "Imported Data",
        pYear,
        pMonth,
        entry.Retailer || '',
        entry.Customer || '',
        entry.EntryTimestamp || new Date().toISOString()
      ]
    );
  }

  if (lastRollNo > 0) {
    const settings = await getRollSettings();
    if (lastRollNo > (settings.LAST_ROLL_NO || 0)) {
      await query(
        `INSERT INTO app_config (config_key, config_value)
         VALUES ('roll_settings', $1)
         ON CONFLICT (config_key)
         DO UPDATE SET config_value = EXCLUDED.config_value`,
        [JSON.stringify({ ...settings, LAST_ROLL_NO: lastRollNo })]
      );
    }
  }

  res.status(201).json({ 
    message: `${entries.length} records imported successfully`
  });
}));

app.post("/api/utils/normalize-dates", safeHandler(async (req, res) => {
  const normalizeDate = (dateStr: string | number) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'number') {
      const d = new Date((dateStr - (25567 + 2)) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    const str = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    } catch (e) {}
    return str;
  };

  const snapshot = await query("SELECT roll_id, production_date FROM production_records");
  let count = 0;
  for (const row of snapshot.rows) {
    const nDate = normalizeDate(row.production_date);
    if (nDate && nDate !== row.production_date) {
      await query("UPDATE production_records SET production_date = $1 WHERE roll_id = $2", [nDate, row.roll_id]);
      count++;
    }
  }
  res.json({ message: `Normalized ${count} records` });
}));

// Machine Downtime Logs
app.get("/api/machine-logs", safeHandler(async (req, res) => {
  const sql = `
    SELECT 
      id,
      machine_no AS "machineId",
      status,
      reason,
      COALESCE((duration_mins / 60.0), 0.00) AS "durationHrs",
      start_time AS "startTime",
      COALESCE(end_time::text, 'Ongoing') AS "endTime",
      breakdown_type AS "breakdownType"
    FROM machine_logs
    ORDER BY start_time DESC
  `;
  const result = await query(sql);
  res.json(result.rows);
}));

app.post("/api/machine-logs", safeHandler(async (req, res) => {
  const log = req.body;
  const sql = `
    INSERT INTO machine_logs (machine_no, status, start_time, end_time, duration_mins, reason, breakdown_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `;
  const durationMins = log.durationHrs ? Number(log.durationHrs) * 60 : 0;
  const result = await query(sql, [
    log.machineId,
    log.status,
    log.startTime || new Date(),
    log.endTime !== 'Ongoing' ? log.endTime : null,
    durationMins,
    log.reason || '',
    log.breakdownType || null
  ]);

  res.json({ message: "Log created", id: result.rows[0].id });
}));

// Pending Orders Upload
app.get("/api/pending-orders/current", safeHandler(async (req, res) => {
  const resMeta = await query("SELECT config_value FROM app_config WHERE config_key = 'pending_orders_info'");
  if (resMeta.rows.length > 0) {
    return res.json(resMeta.rows[0].config_value);
  }
  res.json(null);
}));

app.post("/api/pending-orders/upload", safeHandler(async (req, res) => {
  const { base64Content, filename } = req.body;
  if (!base64Content || !filename) {
    return res.status(400).json({ error: "Missing file content or filename" });
  }

  let cleanBase64 = base64Content;
  if (base64Content.includes(';base64,')) {
    cleanBase64 = base64Content.split(';base64,')[1];
  }
  const buffer = Buffer.from(cleanBase64, 'base64');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!rawData || rawData.length === 0) {
    throw new Error("The uploaded file does not contain any readable rows.");
  }

  // Column matching logic
  let headerRowIndex = 2; // Default Row 3 is index 2
  let piIndex = -1;
  let retailerIndex = -1;
  let customerIndex = -1;

  if (rawData.length > 2) {
    const row = rawData[2];
    if (row && Array.isArray(row)) {
      const colNamesLower = row.map(h => String(h || "").trim().toLowerCase());
      piIndex = colNamesLower.findIndex(s => s && (s.includes("pi") || s.includes("proforma")));
      retailerIndex = colNamesLower.findIndex(s => s && (s.includes("retailer") || s.includes("brand")));
      customerIndex = colNamesLower.findIndex(s => s && (s.includes("customer") || s.includes("buyer") || s.includes("factory")));
    }
  }

  if (piIndex === -1 || retailerIndex === -1 || customerIndex === -1) {
    for (let r = 0; r < Math.min(rawData.length, 50); r++) {
      if (r === 2) continue;
      const row = rawData[r];
      if (!row || !Array.isArray(row)) continue;

      const colNamesLower = row.map(h => String(h || "").trim().toLowerCase());
      const tempPiIndex = colNamesLower.findIndex(s => s && (s.includes("pi") || s.includes("proforma")));
      const tempRetailerIndex = colNamesLower.findIndex(s => s && (s.includes("retailer") || s.includes("brand")));
      const tempCustomerIndex = colNamesLower.findIndex(s => s && (s.includes("customer") || s.includes("buyer") || s.includes("factory")));

      let matchCount = 0;
      if (tempPiIndex !== -1) matchCount++;
      if (tempRetailerIndex !== -1) matchCount++;
      if (tempCustomerIndex !== -1) matchCount++;

      if (matchCount >= 2) {
        headerRowIndex = r;
        if (tempPiIndex !== -1) piIndex = tempPiIndex;
        if (tempRetailerIndex !== -1) retailerIndex = tempRetailerIndex;
        if (tempCustomerIndex !== -1) customerIndex = tempCustomerIndex;
        break;
      }
    }
  }

  const missing: string[] = [];
  if (piIndex === -1) missing.push("'PI No.'");
  if (retailerIndex === -1) missing.push("'Retailer'");
  if (customerIndex === -1) missing.push("'Customer'");

  if (missing.length > 0) {
    throw new Error(`Row 3 (or headers) did not contain required columns: ${missing.join(", ")}`);
  }

  // deduplicate
  const seen = new Set<string>();
  const uniqueRows: { pi: string, retailer: string, customer: string }[] = [];

  const startIdx = headerRowIndex + 1;
  for (let idx = startIdx; idx < rawData.length; idx++) {
    const row = rawData[idx];
    if (!row || !Array.isArray(row)) continue;

    const piVal = String(row[piIndex] !== undefined && row[piIndex] !== null ? row[piIndex] : "").trim();
    const retailerVal = String(row[retailerIndex] !== undefined && row[retailerIndex] !== null ? row[retailerIndex] : "").trim();
    const customerVal = String(row[customerIndex] !== undefined && row[customerIndex] !== null ? row[customerIndex] : "").trim();

    if (!piVal && !retailerVal && !customerVal) continue;

    const key = `${piVal.toLowerCase()}||${retailerVal.toLowerCase()}||${customerVal.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push({ pi: piVal, retailer: retailerVal, customer: customerVal });
    }
  }

  // Clear previous pending orders
  await query("DELETE FROM pending_orders");

  // Save new pending orders
  for (const row of uniqueRows) {
    await query(
      `INSERT INTO pending_orders (pi_number, retailer, customer, imported_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (pi_number) DO UPDATE SET retailer = EXCLUDED.retailer, customer = EXCLUDED.customer`,
      [row.pi, row.retailer, row.customer]
    );
  }

  // Backfill existing production records with retailer/customer metadata from newly imported sheet
  const prodRecords = await query("SELECT roll_id, pi_number FROM production_records");
  for (const record of prodRecords.rows) {
    const details = getMatchedDetails(uniqueRows.map(r => ({ pi_number: r.pi, retailer: r.retailer, customer: r.customer })), record.pi_number);
    if (details.retailer || details.customer) {
      await query(
        "UPDATE production_records SET retailer = $1, customer = $2 WHERE roll_id = $3",
        [details.retailer, details.customer, record.roll_id]
      );
    }
  }

  const uploadTimeStr = new Date().toISOString();
  const summaryMetadata = {
    filename,
    uploadedAt: uploadTimeStr,
    totalRows: uniqueRows.length,
    webViewLink: "#local-sql-server",
    spreadsheetId: "sql_production_db"
  };

  await query(
    `INSERT INTO app_config (config_key, config_value)
     VALUES ('pending_orders_info', $1)
     ON CONFLICT (config_key)
     DO UPDATE SET config_value = EXCLUDED.config_value`,
    [JSON.stringify(summaryMetadata)]
  );

  res.json(summaryMetadata);
}));

app.delete("/api/pending-orders/current", safeHandler(async (req, res) => {
  await query("DELETE FROM pending_orders");
  await query("DELETE FROM app_config WHERE config_key = 'pending_orders_info'");
  res.json({ message: "Successfully cleared pending orders from database" });
}));

app.post("/api/utils/clear-breakdown", safeHandler(async (req, res) => {
  await query("DELETE FROM machine_logs");
  await query(
    `UPDATE machines 
     SET status = 'Running',
         reason = '',
         idle_time = 0,
         breakdown_time = 0,
         num_idle = 0,
         num_breakdown = 0,
         last_status_change = NOW()`
  );
  await query("DELETE FROM machine_daily_stats");
  res.json({ message: "Cleared logs and reset all machine statistics successfully." });
}));

// Dashboard Data Generator
app.get("/api/dashboard", safeHandler(async (req, res) => {
  const dateQuery = req.query.date as string;
  const todayStr = dateQuery || new Date().toISOString().split('T')[0];

  // Fetch machines and daily stats
  const mSql = `
    SELECT 
      m.machine_no AS id,
      m.type,
      COALESCE(s.target_kgs, m.target_kgs) AS target,
      m.status,
      m.reason,
      COALESCE(s.num_idle, m.num_idle) AS "numIdle",
      COALESCE(s.num_breakdown, m.num_breakdown) AS "numBreakdown",
      COALESCE(s.idle_time, m.idle_time) AS "idleTime",
      COALESCE(s.breakdown_time, m.breakdown_time) AS "breakdownTime",
      m.last_status_change AS "lastStatusChange"
    FROM machines m
    LEFT JOIN machine_daily_stats s 
      ON m.machine_no = s.machine_no 
      AND s.date = $1
    ORDER BY m.machine_no ASC
  `;
  const machinesRes = await query(mSql, [todayStr]);
  const baseMachines = machinesRes.rows;

  // Fetch production records for the date (or all if not filtered)
  let prodSql = `
    SELECT 
      roll_id AS "RollID",
      production_date::text AS "ProductionDate",
      shift AS "Shift",
      production_type AS "ProductionType",
      operator_id AS "OperatorID",
      operator_name AS "OperatorName",
      machine_no AS "MachineNo",
      pi_number AS "PINumber",
      tube_size AS "TubeSize",
      uom AS "UOM",
      material AS "Material",
      micron AS "Micron",
      in_line_print AS "InLinePrint",
      finished_meter AS "FinishedMeter",
      finished_kgs AS "FinishedKgs",
      roll_location AS "RollLocation",
      scrap_kgs AS "ScrapKgs",
      machine_status AS "MachineStatus",
      data_update_time AS "DataUpdateTime",
      fingerprint AS "Fingerprint",
      entered_by AS "EnteredBy",
      retailer AS "Retailer",
      customer AS "Customer",
      entry_timestamp AS "EntryTimestamp"
     FROM production_records
     WHERE production_date = $1
     ORDER BY entry_timestamp ASC
  `;
  const prodParams = [todayStr];
  
  const prodRes = await query(prodSql, prodParams);
  const masterData = prodRes.rows;

  const summary = baseMachines.map((m: any) => {
    const machineProduction = masterData.filter((d: any) => d.MachineNo === m.id);

    let idleNoOfTimes = m.numIdle || 0;
    let idleTimeHrs = Number(m.idleTime) || 0;
    let breakdownNoOfTimes = m.numBreakdown || 0;
    let breakdownTimeHrs = Number(m.breakdownTime) || 0;

    // Handle ongoing status
    if (m.status === 'Idle') {
      if (idleNoOfTimes === 0) idleNoOfTimes = 1;
      if (m.lastStatusChange && !isNaN(Date.parse(m.lastStatusChange))) {
        const elapsedMs = Date.now() - new Date(m.lastStatusChange).getTime();
        const elapsedHrs = Math.max(0, elapsedMs / (1000 * 60 * 60));
        idleTimeHrs += elapsedHrs;
      }
    } else if (m.status === 'Breakdown') {
      if (breakdownNoOfTimes === 0) breakdownNoOfTimes = 1;
      if (m.lastStatusChange && !isNaN(Date.parse(m.lastStatusChange))) {
        const elapsedMs = Date.now() - new Date(m.lastStatusChange).getTime();
        const elapsedHrs = Math.max(0, elapsedMs / (1000 * 60 * 60));
        breakdownTimeHrs += elapsedHrs;
      }
    }

    const idleDurationMins = Number((idleTimeHrs * 60).toFixed(2));
    const breakdownDurationMins = Number((breakdownTimeHrs * 60).toFixed(2));

    const totalMeter = machineProduction.reduce((acc, curr) => acc + (Number(curr.FinishedMeter) || 0), 0);
    const totalProductionKgs = machineProduction.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0);

    return {
      Date: todayStr,
      MachineNo: m.id || 'Unknown',
      TargetKgs: m.target || 0,
      TotalRolls: machineProduction.length || 0,
      TotalMeter: totalMeter,
      TotalProductionKgs: totalProductionKgs,
      MachineStatus: m.status || 'Idle',
      BreakdownType: (m.status === 'Breakdown' && m.reason !== 'NO_ALERTS' && m.reason !== 'Initial Setup') ? (m.reason || '') : '',
      ReasonOfIdle: (m.status === 'Idle' && m.reason !== 'NO_ALERTS' && m.reason !== 'Initial Setup') ? (m.reason || '') : '',
      LastUpdateTime: m.lastStatusChange || (machineProduction.length > 0 ? machineProduction[machineProduction.length - 1].DataUpdateTime : "N/A"),
      BreakdownNoOfTimes: breakdownNoOfTimes,
      BreakdownDurationMins: breakdownDurationMins,
      IdleNoOfTimes: idleNoOfTimes,
      IdleDurationMins: idleDurationMins,
      LastUpdate: m.lastStatusChange || (machineProduction.length > 0 ? machineProduction[machineProduction.length - 1].DataUpdateTime : "N/A"),
      Reason: (m.reason === 'NO_ALERTS' || m.reason === 'Initial Setup') ? '' : (m.reason || '')
    };
  });

  res.json({
    summary,
    dailyTotals: {
      totalKgs: masterData.reduce((acc, curr) => acc + (Number(curr.FinishedKgs) || 0), 0),
      totalRolls: masterData.length,
      totalMeter: masterData.reduce((acc, curr) => acc + (Number(curr.FinishedMeter) || 0), 0)
    }
  });
}));

// Bootstrapping DB and Seeding logic
initializeDatabase()
  .then(() => {
    console.log("[PostgreSQL] DB successfully verified and initialized.");
  })
  .catch(err => {
    console.error("[PostgreSQL] Failed to initialize db:", err);
  });

export default app;
