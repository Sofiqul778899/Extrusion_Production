import 'dotenv/config';
import mssql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export let isFallbackMode = false;
export const isMSSQL = true;

// MSSQL Pool initialization
let mssqlPool: mssql.ConnectionPool | null = null;

async function getMSSQLPool() {
  if (mssqlPool) return mssqlPool;
  
  const rawConnStr = process.env.MSSQL_CONNECTION_STRING;
  const rawServer = process.env.MSSQL_HOST || process.env.MSSQL_SERVER || 'localhost';
  const instanceName = process.env.MSSQL_INSTANCE_NAME;
  const database = process.env.MSSQL_DATABASE || 'Extrusion_DB';
  const user = process.env.MSSQL_USER || 'sa';
  const password = process.env.MSSQL_PASSWORD;
  const port = parseInt(process.env.MSSQL_PORT || '1433', 10);

  const normalizeConnStr = (cs: string) => {
    return cs
      .replace(/Data Source=/gi, 'Server=')
      .replace(/Initial Catalog=/gi, 'Database=')
      .replace(/User ID=/gi, 'User Id=')
      .replace(/Trust Server Certificate=/gi, 'TrustServerCertificate=')
      .replace(/Integrated Security=True/gi, 'Trusted_Connection=Yes')
      .replace(/Integrated Security=SSPI/gi, 'Trusted_Connection=Yes');
  };

  const connStr = rawConnStr ? normalizeConnStr(rawConnStr) : null;

  if (connStr && (connStr.includes('YOUR_ACTUAL_PASSWORD') || connStr.includes('YOUR_PASSWORD') || (password && password.includes('YOUR_')))) {
    console.warn('[MSSQL] Notice: Placeholder password detected in .env file. Please replace YOUR_ACTUAL_PASSWORD in .env with your real SQL Server / LocalDB password.');
  }

  const isLocalDB = (rawConnStr && rawConnStr.toLowerCase().includes('localdb')) || 
                    rawServer.toLowerCase().includes('localdb');

  // Strategy 1: Connection string provided
  if (connStr) {
    console.log('[MSSQL] Attempting connection using MSSQL_CONNECTION_STRING...');
    
    // Attempt 1a: Standard driver with normalized string
    try {
      mssqlPool = await new mssql.ConnectionPool(connStr).connect();
      console.log('[MSSQL] Connected successfully via MSSQL_CONNECTION_STRING (Standard driver).');
      return mssqlPool;
    } catch (err: any) {
      console.warn('[MSSQL] Standard driver connection string failed:', err?.message || err);
    }

    // Attempt 1b: Native msnodesqlv8 driver (for Windows Auth / LocalDB / ODBC)
    try {
      console.log('[MSSQL] Trying msnodesqlv8 native driver with connection string...');
      const mssqlMS = await import('mssql/msnodesqlv8').then(m => m.default || m);
      mssqlPool = await new mssqlMS.ConnectionPool({ connectionString: connStr } as any).connect();
      console.log('[MSSQL] Connected successfully via msnodesqlv8 driver.');
      return mssqlPool;
    } catch (msErr: any) {
      console.warn('[MSSQL] Native msnodesqlv8 driver connection failed:', msErr?.message || msErr);
    }
  }

  // Strategy 2: LocalDB explicit handling
  if (isLocalDB) {
    const localDbInstance = instanceName || (rawServer.includes('\\') ? rawServer.split('\\')[1] : 'MSSQLLocalDB');
    const localDbConnStr = `Server=(localdb)\\${localDbInstance};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=True;`;
    console.log(`[MSSQL] LocalDB detected. Connecting via msnodesqlv8 with: ${localDbConnStr}`);
    try {
      const mssqlMS = await import('mssql/msnodesqlv8').then(m => m.default || m);
      mssqlPool = await new mssqlMS.ConnectionPool({ connectionString: localDbConnStr } as any).connect();
      console.log('[MSSQL] Connected to LocalDB successfully.');
      return mssqlPool;
    } catch (err: any) {
      console.warn('[MSSQL] LocalDB native connection attempt failed:', err?.message || err);
    }
  }

  // Strategy 3: Standard TCP/IP host attempts
  let cleanHost = rawServer;
  let targetInstance = instanceName;
  if (cleanHost.includes('\\')) {
    const parts = cleanHost.split('\\');
    cleanHost = parts[0];
    if (!targetInstance) targetInstance = parts[1];
  }
  if (cleanHost.toLowerCase() === '(localdb)' || cleanHost === '.') {
    cleanHost = '127.0.0.1';
  }

  const hostsToTry: string[] = [];
  if (cleanHost && cleanHost.toLowerCase() !== '(localdb)') hostsToTry.push(cleanHost);
  if (!hostsToTry.includes('127.0.0.1')) hostsToTry.push('127.0.0.1');
  if (!hostsToTry.includes('localhost')) hostsToTry.push('localhost');

  let lastErr: any = null;
  for (const host of hostsToTry) {
    const config: mssql.config = {
      server: host,
      port,
      user,
      password,
      database,
      options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true', 
        trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false',
        ...(targetInstance ? { instanceName: targetInstance } : {})
      },
      connectionTimeout: 8000,
      requestTimeout: 15000,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    try {
      console.log(`[MSSQL] Connecting via TCP to ${host}:${port} (db: ${database}, user: ${user})...`);
      mssqlPool = await new mssql.ConnectionPool(config).connect();
      console.log('[MSSQL] Connected to Microsoft SQL Server database successfully via TCP.');
      return mssqlPool;
    } catch (err: any) {
      lastErr = err;
      console.warn(`[MSSQL] Connection attempt failed for ${host}:`, err?.message || err);
    }
  }

  throw lastErr;
}

const fallbackFilePath = path.join(process.cwd(), 'api', 'db_fallback.json');

const INITIAL_FALLBACK_DB = {
  app_config: {
    roll_settings: { LAST_ROLL_NO: 17413, PREFIX: "R", CURRENT_YEAR: "26" },
    sample_settings: { LAST_SAMPLE_SERIAL: 0 }
  },
  dropdowns: {
    ref_shifts: ['Day', 'Night', 'A', 'B', 'C'],
    ref_production_types: ['Commercial', 'R&D', 'Trial', 'Sample'],
    ref_uoms: ['Kgs', 'Rolls', 'Meter', 'INCH'],
    ref_materials: ['LDPE', 'HDPE', 'LLDPE', 'PP', 'BOPP'],
    ref_inline_print_options: ['Yes', 'No'],
    ref_years: ['2023', '2024', '2025', '2026', '2027'],
    ref_breakdown_reasons: ['Mechanical', 'Electrical', 'Pneumatic', 'Hydraulic', 'Sensor Failure', 'Heater Band Burnout'],
    ref_idle_reasons: ['No Material', 'No Operator', 'Power Interruption', 'Core Shortage', 'Routine Clean-up', 'Awaiting Maintenance Handover']
  } as Record<string, string[]>,
  operators: [
    { operator_id: 'OP001', name: 'Abul Kalam', email: 'kalam@extrusion.com' },
    { operator_id: 'OP002', name: 'Rahim Uddin', email: 'rahim@extrusion.com' },
    { operator_id: 'OP003', name: 'Milon Hossain', email: 'milon@extrusion.com' },
    { operator_id: 'OP004', name: 'Siddique Rahman', email: 'siddique@extrusion.com' }
  ],
  machines: [
    { machine_no: 'M-01', type: 'Blown Film Extrusion', target_kgs: 800.00, status: 'Running', reason: '', num_idle: 0, num_breakdown: 0, idle_time: 0, breakdown_time: 0, last_status_change: new Date().toISOString() },
    { machine_no: 'M-02', type: 'Blown Film Extrusion', target_kgs: 1000.00, status: 'Running', reason: '', num_idle: 0, num_breakdown: 0, idle_time: 0, breakdown_time: 0, last_status_change: new Date().toISOString() },
    { machine_no: 'M-03', type: 'Co-Extrusion', target_kgs: 1200.00, status: 'Running', reason: '', num_idle: 0, num_breakdown: 0, idle_time: 0, breakdown_time: 0, last_status_change: new Date().toISOString() },
    { machine_no: 'M-04', type: 'Blown Film Extrusion', target_kgs: 800.00, status: 'Running', reason: '', num_idle: 0, num_breakdown: 0, idle_time: 0, breakdown_time: 0, last_status_change: new Date().toISOString() },
    { machine_no: 'M-05', type: 'Monolayer Extrusion', target_kgs: 600.00, status: 'Running', reason: '', num_idle: 0, num_breakdown: 0, idle_time: 0, breakdown_time: 0, last_status_change: new Date().toISOString() }
  ],
  machine_list: ['M-01', 'M-02', 'M-03', 'M-04', 'M-05'],
  pending_orders: [] as any[],
  production_records: [] as any[],
  machine_logs: [] as any[],
  machine_daily_stats: [] as any[]
};

function readFallbackDb() {
  try {
    if (!fs.existsSync(fallbackFilePath)) {
      const parentDir = path.dirname(fallbackFilePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fallbackFilePath, JSON.stringify(INITIAL_FALLBACK_DB, null, 2), 'utf8');
      return INITIAL_FALLBACK_DB;
    }
    const data = fs.readFileSync(fallbackFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Fallback DB] Failed to read db file, using in-memory default:', err);
    return INITIAL_FALLBACK_DB;
  }
}

function writeFallbackDb(db: any) {
  try {
    const parentDir = path.dirname(fallbackFilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fallbackFilePath, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[Fallback DB] Failed to write db file:', err);
  }
}

function mapRecordToPascal(r: any) {
  if (!r) return r;
  const getVal = (key: string) => {
    if (r[key] !== undefined) return r[key];
    const lowerKey = key.toLowerCase();
    if (r[lowerKey] !== undefined) return r[lowerKey];
    // Check if key is camelCase or snake_case
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    if (r[snakeKey] !== undefined) return r[snakeKey];
    return undefined;
  };

  return {
    RollID: getVal('RollID'),
    ProductionDate: getVal('ProductionDate'),
    Shift: getVal('Shift'),
    ProductionType: getVal('ProductionType'),
    OperatorID: getVal('OperatorID'),
    OperatorName: getVal('OperatorName'),
    MachineNo: getVal('MachineNo'),
    Year: getVal('Year'),
    PINumber: getVal('PINumber'),
    TubeSize: getVal('TubeSize'),
    UOM: getVal('UOM'),
    Material: getVal('Material'),
    Micron: getVal('Micron'),
    InLinePrint: getVal('InLinePrint'),
    FinishedMeter: getVal('FinishedMeter'),
    FinishedKgs: getVal('FinishedKgs'),
    RollLocation: getVal('RollLocation'),
    ScrapKgs: getVal('ScrapKgs'),
    MachineStatus: getVal('MachineStatus'),
    DataUpdateTime: getVal('DataUpdateTime'),
    Fingerprint: getVal('Fingerprint'),
    EnteredBy: getVal('EnteredBy'),
    ProductionYear: getVal('ProductionYear'),
    ProductionMonth: getVal('ProductionMonth'),
    Retailer: getVal('Retailer'),
    Customer: getVal('Customer'),
    EntryTimestamp: getVal('EntryTimestamp'),
    // compatibility
    roll_id: getVal('roll_id'),
    pi_number: getVal('pi_number'),
    retailer: getVal('retailer'),
    customer: getVal('customer'),
    production_date: getVal('production_date'),
    production_year: getVal('production_year'),
    production_month: getVal('production_month')
  };
}

export async function runFallbackQuery(text: string, params?: any[]): Promise<any> {
  // machine_list queries
  if (text.includes("FROM machine_list") || text.includes("FROM dbo.machine_list")) {
    const db = readFallbackDb();
    if (!db.machine_list) {
      db.machine_list = ['M-01', 'M-02', 'M-03', 'M-04', 'M-05'];
      writeFallbackDb(db);
    }
    return { rows: db.machine_list.map((m: string) => ({ machine_no: m, id: m, val: m })) };
  }

  if (text.includes("INSERT INTO machine_list") || text.includes("INSERT INTO dbo.machine_list")) {
    const val = params ? params[0] : null;
    if (val) {
      const db = readFallbackDb();
      if (!db.machine_list) {
        db.machine_list = ['M-01', 'M-02', 'M-03', 'M-04', 'M-05'];
      }
      if (!db.machine_list.includes(val)) {
        db.machine_list.push(val);
        writeFallbackDb(db);
      }
    }
    return { rows: [], rowCount: 1 };
  }

  if (text.includes("DELETE FROM machine_list") || text.includes("DELETE FROM dbo.machine_list")) {
    const val = params ? params[0] : null;
    const db = readFallbackDb();
    if (val && db.machine_list) {
      db.machine_list = db.machine_list.filter((m: string) => m !== val);
      writeFallbackDb(db);
    } else {
      db.machine_list = [];
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // Check for SELECT from ref_ tables
  if (text.includes("SELECT val FROM ref_")) {
    const match = text.match(/FROM\s+(ref_\w+)/i);
    const tableName = match ? match[1].toLowerCase() : '';
    const db = readFallbackDb();
    if (!db.dropdowns) {
      db.dropdowns = {
        ref_shifts: ['Day', 'Night', 'A', 'B', 'C'],
        ref_production_types: ['Commercial', 'R&D', 'Trial', 'Sample'],
        ref_uoms: ['Kgs', 'Rolls', 'Meter', 'INCH'],
        ref_materials: ['LDPE', 'HDPE', 'LLDPE', 'PP', 'BOPP'],
        ref_inline_print_options: ['Yes', 'No'],
        ref_years: ['2023', '2024', '2025', '2026', '2027'],
        ref_breakdown_reasons: ['Mechanical', 'Electrical', 'Pneumatic', 'Hydraulic', 'Sensor Failure', 'Heater Band Burnout'],
        ref_idle_reasons: ['No Material', 'No Operator', 'Power Interruption', 'Core Shortage', 'Routine Clean-up', 'Awaiting Maintenance Handover']
      };
      writeFallbackDb(db);
    }
    const list = db.dropdowns[tableName] || [];
    return { rows: list.map((val: string) => ({ val })) };
  }

  // Check for DELETE from ref_ tables
  if (text.includes("DELETE FROM ref_")) {
    const match = text.match(/DELETE FROM\s+(ref_\w+)/i);
    const tableName = match ? match[1].toLowerCase() : '';
    const db = readFallbackDb();
    if (!db.dropdowns) {
      db.dropdowns = {};
    }
    db.dropdowns[tableName] = [];
    writeFallbackDb(db);
    return { rows: [], rowCount: 0 };
  }

  // Check for INSERT INTO ref_ tables
  if (text.includes("INSERT INTO ref_")) {
    const match = text.match(/INSERT INTO\s+(ref_\w+)/i);
    const tableName = match ? match[1].toLowerCase() : '';
    const val = params ? params[0] : null;
    if (tableName && val) {
      const db = readFallbackDb();
      if (!db.dropdowns) {
        db.dropdowns = {};
      }
      if (!db.dropdowns[tableName]) {
        db.dropdowns[tableName] = [];
      }
      if (!db.dropdowns[tableName].includes(val)) {
        db.dropdowns[tableName].push(val);
      }
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // 1. SELECT EXISTS Check
  if (text.includes("SELECT EXISTS") && text.includes("information_schema.tables")) {
    return { rows: [{ exists: true }] };
  }

  // 2. SELECT config_value FROM app_config
  if (text.includes("SELECT config_value FROM app_config")) {
    const key = params ? params[0] : (text.match(/config_key\s*=\s*'([^']+)'/) || [])[1];
    const db = readFallbackDb();
    const val = db.app_config[key as keyof typeof db.app_config];
    return { rows: val ? [{ config_value: val }] : [] };
  }

  // 3. INSERT INTO app_config
  if (text.includes("INSERT INTO app_config")) {
    const key = params ? params[0] : null;
    const valRaw = params ? params[1] : null;
    if (key && valRaw) {
      const val = typeof valRaw === 'string' ? JSON.parse(valRaw) : valRaw;
      const db = readFallbackDb();
      (db.app_config as any)[key] = val;
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // 4. SELECT operators
  if (text.includes("SELECT operator_id AS id") && text.includes("operators")) {
    const db = readFallbackDb();
    const list = [...db.operators];
    list.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return { rows: list.map((o: any) => ({ id: o.operator_id, name: o.name, email: o.email })) };
  }

  // 5. INSERT INTO operators
  if (text.includes("INSERT INTO operators")) {
    const id = params ? params[0] : null;
    const name = params ? params[1] : null;
    const email = params ? params[2] : null;
    if (id && name) {
      const db = readFallbackDb();
      const existingIdx = db.operators.findIndex((o: any) => o.operator_id === id);
      const op = { operator_id: id, name, email: email || "" };
      if (existingIdx >= 0) {
        db.operators[existingIdx] = op;
      } else {
        db.operators.push(op);
      }
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // 6. SELECT machines with LEFT JOIN stats
  if (text.includes("SELECT") && text.includes("machines m") && text.includes("machine_daily_stats s")) {
    const dateStr = params ? params[0] : null;
    const db = readFallbackDb();
    const rows = db.machines.map((m: any) => {
      const stat = dateStr ? db.machine_daily_stats.find((s: any) => s.machine_no === m.machine_no && s.date === dateStr) : null;
      return {
        id: m.machine_no,
        type: m.type,
        target: stat ? (stat.target_kgs ?? m.target_kgs) : m.target_kgs,
        status: m.status,
        reason: m.reason,
        numIdle: stat ? (stat.num_idle ?? m.num_idle) : m.num_idle,
        numBreakdown: stat ? (stat.num_breakdown ?? m.num_breakdown) : m.num_breakdown,
        idleTime: stat ? (stat.idle_time ?? m.idle_time) : m.idle_time,
        breakdownTime: stat ? (stat.breakdown_time ?? m.breakdown_time) : m.breakdown_time,
        lastStatusChange: m.last_status_change
      };
    });
    return { rows };
  }

  // 7. SELECT machines directly
  if (text.includes("SELECT") && text.includes("machine_no AS id") && text.includes("FROM machines")) {
    const db = readFallbackDb();
    const rows = db.machines.map((m: any) => ({
      id: m.machine_no,
      type: m.type,
      target: m.target_kgs,
      status: m.status,
      reason: m.reason,
      numIdle: m.num_idle,
      numBreakdown: m.num_breakdown,
      idleTime: m.idle_time,
      breakdownTime: m.breakdown_time,
      lastStatusChange: m.last_status_change
    }));
    return { rows };
  }

  // 8. SELECT machine_no check
  if (text.includes("SELECT machine_no FROM machines WHERE machine_no =")) {
    const machineNo = params ? params[0] : null;
    const db = readFallbackDb();
    const found = db.machines.find((m: any) => m.machine_no === machineNo);
    return { rows: found ? [{ machine_no: found.machine_no }] : [] };
  }

  // 9. INSERT INTO machines
  if (text.includes("INSERT INTO machines")) {
    const id = params ? params[0] : null;
    const type = params ? params[1] : null;
    const target = params ? Number(params[2]) : 0;
    if (id && type) {
      const db = readFallbackDb();
      if (!db.machines.some((m: any) => m.machine_no === id)) {
        db.machines.push({
          machine_no: id,
          type,
          target_kgs: target,
          status: 'Idle',
          reason: 'Initial Setup',
          num_idle: 0,
          num_breakdown: 0,
          idle_time: 0,
          breakdown_time: 0,
          last_status_change: new Date().toISOString()
        });
        writeFallbackDb(db);
      }
    }
    return { rows: [], rowCount: 1 };
  }

  // 10. SELECT status FROM machines
  if (text.includes("SELECT status, reason, last_status_change FROM machines WHERE machine_no =")) {
    const id = params ? params[0] : null;
    const db = readFallbackDb();
    const m = db.machines.find((x: any) => x.machine_no === id);
    return { rows: m ? [{ status: m.status, reason: m.reason, last_status_change: m.last_status_change }] : [] };
  }

  // 11. UPDATE machines status
  if (text.includes("UPDATE machines")) {
    const id = params ? params[0] : null;
    const status = params ? params[1] : null;
    const reason = params ? params[2] : undefined;
    const target = params ? params[3] : undefined;
    const transitionTime = params ? params[4] : new Date().toISOString();
    
    if (id) {
      const db = readFallbackDb();
      const idx = db.machines.findIndex((x: any) => x.machine_no === id);
      if (idx >= 0) {
        if (status !== null && status !== undefined) db.machines[idx].status = status;
        if (reason !== undefined) db.machines[idx].reason = reason;
        if (target !== undefined && target !== null) db.machines[idx].target_kgs = Number(target);
        if (transitionTime !== undefined && transitionTime !== null) db.machines[idx].last_status_change = transitionTime;
        writeFallbackDb(db);
      }
    }
    return { rows: [], rowCount: 1 };
  }

  // 12. SELECT ongoing log
  if (text.includes("SELECT id, start_time FROM machine_logs") && text.includes("end_time IS NULL")) {
    const machineNo = params ? params[0] : null;
    const db = readFallbackDb();
    const log = db.machine_logs.find((x: any) => x.machine_no === machineNo && !x.end_time);
    return { rows: log ? [{ id: log.id, start_time: log.start_time }] : [] };
  }

  // 13. UPDATE machine_logs
  if (text.includes("UPDATE machine_logs SET end_time =") && text.includes("duration_mins =")) {
    const endTime = params ? params[0] : null;
    const durationMins = params ? Number(params[1]) : 0;
    const id = params ? Number(params[2]) : null;
    if (id) {
      const db = readFallbackDb();
      const idx = db.machine_logs.findIndex((x: any) => x.id === id);
      if (idx >= 0) {
        db.machine_logs[idx].end_time = endTime;
        db.machine_logs[idx].duration_mins = durationMins;
        writeFallbackDb(db);
      }
    }
    return { rows: [], rowCount: 1 };
  }

  // 14. INSERT INTO machine_logs
  if (text.includes("INSERT INTO machine_logs")) {
    const machineNo = params ? params[0] : null;
    const status = params ? params[1] : null;
    const startTime = params ? params[2] : new Date().toISOString();
    const endTime = params ? params[3] : null;
    const durationMins = params ? Number(params[4]) : 0;
    const reason = params ? params[5] : '';
    const breakdownType = params ? params[6] : null;
    
    if (machineNo && status) {
      const db = readFallbackDb();
      const nextId = db.machine_logs.length > 0 ? Math.max(...db.machine_logs.map((x: any) => x.id)) + 1 : 1;
      db.machine_logs.push({
        id: nextId,
        machine_no: machineNo,
        status,
        start_time: startTime,
        end_time: endTime,
        duration_mins: durationMins,
        reason,
        breakdown_type: breakdownType
      });
      writeFallbackDb(db);
      return { rows: [{ id: nextId }], rowCount: 1 };
    }
    return { rows: [{ id: 1 }], rowCount: 1 };
  }

  // 15. SELECT id FROM machine_daily_stats
  if (text.includes("SELECT id FROM machine_daily_stats WHERE machine_no =")) {
    const machineNo = params ? params[0] : null;
    const date = params ? params[1] : null;
    const db = readFallbackDb();
    const stat = db.machine_daily_stats.find((x: any) => x.machine_no === machineNo && x.date === date);
    return { rows: stat ? [{ id: stat.id }] : [] };
  }

  // 16. UPDATE machine_daily_stats
  if (text.includes("UPDATE machine_daily_stats SET")) {
    const machineNo = params ? params[0] : null;
    const date = params ? params[1] : null;
    const target = params ? params[2] : undefined;
    const numIdle = params ? params[3] : undefined;
    const numBreakdown = params ? params[4] : undefined;
    const idleTime = params ? params[5] : undefined;
    const breakdownTime = params ? params[6] : undefined;
    
    if (machineNo && date) {
      const db = readFallbackDb();
      const idx = db.machine_daily_stats.findIndex((x: any) => x.machine_no === machineNo && x.date === date);
      if (idx >= 0) {
        if (target !== undefined && target !== null) db.machine_daily_stats[idx].target_kgs = Number(target);
        if (numIdle !== undefined && numIdle !== null) db.machine_daily_stats[idx].num_idle = Number(numIdle);
        if (numBreakdown !== undefined && numBreakdown !== null) db.machine_daily_stats[idx].num_breakdown = Number(numBreakdown);
        if (idleTime !== undefined && idleTime !== null) db.machine_daily_stats[idx].idle_time = Number(idleTime);
        if (breakdownTime !== undefined && breakdownTime !== null) db.machine_daily_stats[idx].breakdown_time = Number(breakdownTime);
        writeFallbackDb(db);
      }
    }
    return { rows: [], rowCount: 1 };
  }

  // 17. INSERT INTO machine_daily_stats
  if (text.includes("INSERT INTO machine_daily_stats")) {
    const machineNo = params ? params[0] : null;
    const date = params ? params[1] : null;
    const target = params ? Number(params[2]) : 0;
    const numIdle = params ? Number(params[3]) : 0;
    const numBreakdown = params ? Number(params[4]) : 0;
    const idleTime = params ? Number(params[5]) : 0;
    const breakdownTime = params ? Number(params[6]) : 0;
    
    if (machineNo && date) {
      const db = readFallbackDb();
      const nextId = db.machine_daily_stats.length > 0 ? Math.max(...db.machine_daily_stats.map((x: any) => x.id)) + 1 : 1;
      db.machine_daily_stats.push({
        id: nextId,
        machine_no: machineNo,
        date,
        target_kgs: target,
        num_idle: numIdle,
        num_breakdown: numBreakdown,
        idle_time: idleTime,
        breakdown_time: breakdownTime
      });
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // 18. SELECT production_records
  if (text.includes("FROM production_records")) {
    const db = readFallbackDb();
    let list = [...db.production_records];
    
    const hasDateQuery = text.includes("WHERE production_date = $1");
    const dateQueryVal = hasDateQuery && params ? params[0] : null;
    
    if (dateQueryVal) {
      list = list.filter((r: any) => r.production_date === dateQueryVal);
    }
    
    if (text.includes("WHERE roll_id =")) {
      const rollId = params ? params[0] : null;
      const item = list.find((r: any) => r.roll_id === rollId);
      return { rows: item ? [mapRecordToPascal(item)] : [] };
    }
    
    if (text.includes("ORDER BY entry_timestamp DESC")) {
      list.sort((a: any, b: any) => new Date(b.entry_timestamp).getTime() - new Date(a.entry_timestamp).getTime());
    } else {
      list.sort((a: any, b: any) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());
    }
    
    if (text.includes("LIMIT 50")) {
      list = list.slice(0, 50);
    }
    
    return { rows: list.map(mapRecordToPascal) };
  }

  // 19. INSERT INTO production_records
  if (text.includes("INSERT INTO production_records")) {
    if (params) {
      const db = readFallbackDb();
      const rollId = params[0];
      const rec = {
        roll_id: rollId,
        production_date: params[1],
        shift: params[2],
        production_type: params[3],
        operator_id: params[4],
        operator_name: params[5],
        machine_no: params[6],
        year: params[7],
        pi_number: params[8],
        tube_size: params[9],
        uom: params[10],
        material: params[11],
        micron: params[12],
        in_line_print: params[13],
        finished_meter: Number(params[14]) || 0,
        finished_kgs: Number(params[15]) || 0,
        roll_location: params[16],
        scrap_kgs: Number(params[17]) || 0,
        machine_status: params[18],
        data_update_time: params[19],
        fingerprint: params[20],
        entered_by: params[21],
        production_year: params[22],
        production_month: params[23],
        retailer: params[24],
        customer: params[25],
        entry_timestamp: params[26]
      };
      const existingIdx = db.production_records.findIndex((x: any) => x.roll_id === rollId);
      if (existingIdx >= 0) {
        db.production_records[existingIdx] = rec;
      } else {
        db.production_records.push(rec);
      }
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // 20. UPDATE production_records
  if (text.includes("UPDATE production_records")) {
    const rollId = params ? params[0] : null;
    if (rollId && params) {
      const db = readFallbackDb();
      const idx = db.production_records.findIndex((x: any) => x.roll_id === rollId);
      if (idx >= 0) {
        const orig = db.production_records[idx];
        db.production_records[idx] = {
          roll_id: rollId,
          production_date: params[1] !== undefined && params[1] !== null ? params[1] : orig.production_date,
          shift: params[2] !== undefined && params[2] !== null ? params[2] : orig.shift,
          production_type: params[3] !== undefined && params[3] !== null ? params[3] : orig.production_type,
          operator_id: params[4] !== undefined && params[4] !== null ? params[4] : orig.operator_id,
          operator_name: params[5] !== undefined && params[5] !== null ? params[5] : orig.operator_name,
          machine_no: params[6] !== undefined && params[6] !== null ? params[6] : orig.machine_no,
          year: params[7] !== undefined && params[7] !== null ? params[7] : orig.year,
          pi_number: params[8] !== undefined && params[8] !== null ? params[8] : orig.pi_number,
          tube_size: params[9] !== undefined && params[9] !== null ? params[9] : orig.tube_size,
          uom: params[10] !== undefined && params[10] !== null ? params[10] : orig.uom,
          material: params[11] !== undefined && params[11] !== null ? params[11] : orig.material,
          micron: params[12] !== undefined && params[12] !== null ? params[12] : orig.micron,
          in_line_print: params[13] !== undefined && params[13] !== null ? params[13] : orig.in_line_print,
          finished_meter: params[14] !== undefined && params[14] !== null ? Number(params[14]) : orig.finished_meter,
          finished_kgs: params[15] !== undefined && params[15] !== null ? Number(params[15]) : orig.finished_kgs,
          roll_location: params[16] !== undefined && params[16] !== null ? params[16] : orig.roll_location,
          scrap_kgs: params[17] !== undefined && params[17] !== null ? Number(params[17]) : orig.scrap_kgs,
          machine_status: params[18] !== undefined && params[18] !== null ? params[18] : orig.machine_status,
          data_update_time: params[19] || orig.data_update_time,
          fingerprint: orig.fingerprint,
          entered_by: orig.entered_by,
          production_year: params[20] || orig.production_year,
          production_month: params[21] || orig.production_month,
          retailer: params[22] !== undefined && params[22] !== null ? params[22] : orig.retailer,
          customer: params[23] !== undefined && params[23] !== null ? params[23] : orig.customer,
          entry_timestamp: orig.entry_timestamp
        };
        writeFallbackDb(db);
      }
    }
    return { rows: [], rowCount: 1 };
  }

  // 21. DELETE FROM pending_orders
  if (text.includes("DELETE FROM pending_orders")) {
    const db = readFallbackDb();
    db.pending_orders = [];
    writeFallbackDb(db);
    return { rows: [], rowCount: 1 };
  }

  // 22. INSERT INTO pending_orders
  if (text.includes("INSERT INTO pending_orders")) {
    const pi = params ? params[0] : null;
    const retailer = params ? params[1] : '';
    const customer = params ? params[2] : '';
    if (pi) {
      const db = readFallbackDb();
      const existingIdx = db.pending_orders.findIndex((x: any) => x.pi_number === pi);
      const item = { pi_number: pi, retailer, customer, imported_at: new Date().toISOString() };
      if (existingIdx >= 0) {
        db.pending_orders[existingIdx] = item;
      } else {
        db.pending_orders.push(item);
      }
      writeFallbackDb(db);
    }
    return { rows: [], rowCount: 1 };
  }

  // 23. SELECT pending_orders details
  if (text.includes("FROM pending_orders")) {
    const db = readFallbackDb();
    return { rows: db.pending_orders };
  }

  // 24. SELECT machine logs
  if (text.includes("FROM machine_logs")) {
    const db = readFallbackDb();
    const rows = db.machine_logs.map((x: any) => ({
      id: x.id,
      machineId: x.machine_no,
      status: x.status,
      reason: x.reason,
      durationHrs: Number((x.duration_mins / 60.0).toFixed(2)),
      startTime: x.start_time,
      endTime: x.end_time || 'Ongoing',
      breakdownType: x.breakdown_type
    }));
    // sort start_time DESC
    rows.sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return { rows };
  }

  // 25. DELETE FROM machine_logs
  if (text.includes("DELETE FROM machine_logs")) {
    const db = readFallbackDb();
    db.machine_logs = [];
    writeFallbackDb(db);
    return { rows: [], rowCount: 1 };
  }

  // 26. DELETE FROM machine_daily_stats
  if (text.includes("DELETE FROM machine_daily_stats")) {
    const db = readFallbackDb();
    db.machine_daily_stats = [];
    writeFallbackDb(db);
    return { rows: [], rowCount: 1 };
  }

  // Default empty fallback
  return { rows: [], rowCount: 0 };
}

function translateQueryForMSSQL(text: string, params?: any[]) {
  let mssqlText = text;

  // Replace PostgreSQL typecasts
  mssqlText = mssqlText.replace(/production_date::text/gi, 'CONVERT(VARCHAR(10), production_date, 120)');
  mssqlText = mssqlText.replace(/end_time::text/gi, 'CONVERT(VARCHAR(19), end_time, 120)');
  mssqlText = mssqlText.replace(/::text/gi, '');

  // NOW() -> GETDATE()
  mssqlText = mssqlText.replace(/\bNOW\(\)/gi, 'GETDATE()');
  mssqlText = mssqlText.replace(/\bCURRENT_TIMESTAMP\b/gi, 'GETDATE()');

  // Specific check for exists
  if (text.includes("information_schema.tables")) {
    return `
      SELECT CASE WHEN EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'production_records'
      ) THEN 1 ELSE 0 END AS [exists]
    `;
  }

  // Handle ON CONFLICT app_config
  if (text.includes("INSERT INTO app_config") && text.includes("ON CONFLICT")) {
    if (text.includes("'dropdowns'")) {
      return `
        IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'dropdowns')
          UPDATE dbo.app_config SET config_value = @p1 WHERE config_key = 'dropdowns'
        ELSE
          INSERT INTO dbo.app_config (config_key, config_value) VALUES ('dropdowns', @p1);
      `;
    }
    if (text.includes("'date_filter'")) {
      return `
        IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'date_filter')
          UPDATE dbo.app_config SET config_value = @p1 WHERE config_key = 'date_filter'
        ELSE
          INSERT INTO dbo.app_config (config_key, config_value) VALUES ('date_filter', @p1);
      `;
    }
    if (text.includes("'roll_settings'")) {
      return `
        IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'roll_settings')
          UPDATE dbo.app_config SET config_value = @p1 WHERE config_key = 'roll_settings'
        ELSE
          INSERT INTO dbo.app_config (config_key, config_value) VALUES ('roll_settings', @p1);
      `;
    }
    if (text.includes("'sample_settings'")) {
      return `
        IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'sample_settings')
          UPDATE dbo.app_config SET config_value = @p1 WHERE config_key = 'sample_settings'
        ELSE
          INSERT INTO dbo.app_config (config_key, config_value) VALUES ('sample_settings', @p1);
      `;
    }
    if (text.includes("'pending_orders_info'")) {
      return `
        IF EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'pending_orders_info')
          UPDATE dbo.app_config SET config_value = @p1 WHERE config_key = 'pending_orders_info'
        ELSE
          INSERT INTO dbo.app_config (config_key, config_value) VALUES ('pending_orders_info', @p1);
      `;
    }
  }

  // Handle ON CONFLICT operators
  if (text.includes("INSERT INTO operators") && text.includes("ON CONFLICT")) {
    return `
      IF EXISTS (SELECT 1 FROM dbo.operators WHERE operator_id = @p1)
        UPDATE dbo.operators SET name = @p2, email = @p3 WHERE operator_id = @p1
      ELSE
        INSERT INTO dbo.operators (operator_id, name, email) VALUES (@p1, @p2, @p3);
    `;
  }

  // Handle ON CONFLICT pending_orders
  if (text.includes("INSERT INTO pending_orders") && text.includes("ON CONFLICT")) {
    return `
      IF EXISTS (SELECT 1 FROM dbo.pending_orders WHERE pi_number = @p1)
        UPDATE dbo.pending_orders SET retailer = @p2, customer = @p3 WHERE pi_number = @p1
      ELSE
        INSERT INTO dbo.pending_orders (pi_number, retailer, customer, imported_at) VALUES (@p1, @p2, @p3, GETDATE());
    `;
  }

  // Handle ON CONFLICT production_records
  if (text.includes("INSERT INTO production_records") && text.includes("ON CONFLICT")) {
    return `
      IF EXISTS (SELECT 1 FROM dbo.production_records WHERE roll_id = @p1)
        UPDATE dbo.production_records SET
          production_date = @p2,
          shift = @p3,
          production_type = @p4,
          operator_name = @p6,
          machine_no = @p7,
          finished_meter = @p15,
          finished_kgs = @p16,
          scrap_kgs = @p18,
          retailer = @p25,
          customer = @p26
        WHERE roll_id = @p1
      ELSE
        INSERT INTO dbo.production_records (
          roll_id, production_date, shift, production_type, operator_id, operator_name, machine_no,
          year, pi_number, tube_size, uom, material, micron, in_line_print, finished_meter, finished_kgs,
          roll_location, scrap_kgs, machine_status, data_update_time, fingerprint, entered_by,
          production_year, production_month, retailer, customer, entry_timestamp
        ) VALUES (
          @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17, @p18, @p19, @p20, @p21, @p22, @p23, @p24, @p25, @p26, @p27
        );
    `;
  }

  // Handle LIMIT conversion
  const limitMatch = mssqlText.match(/LIMIT\s+(\d+)\s*$/i);
  if (limitMatch) {
    const limitNum = limitMatch[1];
    mssqlText = mssqlText.replace(/LIMIT\s+\d+\s*$/i, '');
    if (/^\s*SELECT/i.test(mssqlText)) {
      mssqlText = mssqlText.replace(/^\s*SELECT/i, `SELECT TOP ${limitNum}`);
    }
  }

  // Translate PostgreSQL style $1, $2, etc. placeholders to @p1, @p2, etc.
  if (params && params.length > 0) {
    for (let i = 1; i <= params.length; i++) {
      const regex = new RegExp(`\\$${i}(?!\\d)`, 'g');
      mssqlText = mssqlText.replace(regex, `@p${i}`);
    }
  }

  return mssqlText;
}

async function runMSSQLQuery(text: string, params?: any[]) {
  try {
    const mssqlPoolInstance = await getMSSQLPool();
    const req = mssqlPoolInstance.request();

    const mssqlText = translateQueryForMSSQL(text, params);

    if (params && params.length > 0) {
      params.forEach((val, idx) => {
        req.input(`p${idx + 1}`, val === undefined ? null : val);
      });
    }

    const result = await req.query(mssqlText);

    // Convert keys to case-insensitive support for frontend expectations
    const mappedRows = (result.recordset || []).map(row => {
      // Let's return the row as is, plus the exists column mapped specifically if requested
      if (row.exists !== undefined && row.exists !== null) {
        // Map 1/0 case of Case exists to true/false
        row.exists = !!row.exists;
      }
      return row;
    });

    return {
      rows: mappedRows,
      rowCount: mappedRows.length
    };
  } catch (err: any) {
    console.error('[MSSQL] Query execution error:', err.message, '\nQuery:', text);
    throw err;
  }
}

export async function query(text: string, params?: any[]) {
  if (isFallbackMode) {
    return runFallbackQuery(text, params);
  }
  try {
    return await runMSSQLQuery(text, params);
  } catch (err: any) {
    const isConnError = err.message.includes('ECONNREFUSED') || 
                        err.message.includes('ETIMEDOUT') || 
                        err.message.includes('ENOTFOUND') || 
                        err.message.includes('connection') ||
                        err.message.includes('ConnectionError') ||
                        err.message.includes('socket');
    if (isConnError) {
      console.warn('[MSSQL] Connection refused or lost. Enabling local JSON file-based database fallback.', err.message);
      isFallbackMode = true;
      return runFallbackQuery(text, params);
    }
    throw err;
  }
}

// Automatically create tables if they do not exist
export async function initializeDatabase() {
  console.log('[MSSQL] Initializing SQL Server database connection...');
  try {
    const mPool = await getMSSQLPool();
    await mPool.request().query("SELECT 1 AS ok");
    console.log('[MSSQL] Database server is reachable and online.');
  } catch (err: any) {
    console.warn('[MSSQL] Database connection failed:', err.message);
    console.warn('[MSSQL] Switched to local persistent JSON file-based database fallback.');
    isFallbackMode = true;
    readFallbackDb();
    return;
  }

  try {
    // Check if core table exists in MSSQL
    const checkRes = await runMSSQLQuery(`
      SELECT CASE WHEN EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'production_records'
      ) THEN 1 ELSE 0 END AS [exists]
    `);
    
    const tablesExist = checkRes.rows[0]?.exists;
    if (tablesExist) {
      console.log('[MSSQL] Core tables already exist. Ensuring machine_list table exists...');
      try {
        await runMSSQLQuery(`
          IF OBJECT_ID('dbo.machine_list', 'U') IS NULL
          BEGIN
              CREATE TABLE dbo.machine_list (
                  id INT IDENTITY(1,1) PRIMARY KEY,
                  machine_no VARCHAR(100) NOT NULL UNIQUE,
                  created_at DATETIME2 DEFAULT GETDATE()
              );
              INSERT INTO dbo.machine_list (machine_no) VALUES ('M-01'), ('M-02'), ('M-03'), ('M-04'), ('M-05');
          END;
        `);
      } catch (err: any) {
        console.warn('[MSSQL] Could not check/create machine_list table:', err.message);
      }
      return;
    }

    console.log('[MSSQL] Core tables do not exist. Bootstrapping MS SQL Server schema...');
    
    const schemaPath = path.join(process.cwd(), 'mssql_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.warn('[MSSQL] mssql_schema.sql not found at:', schemaPath);
      return;
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // SQL Server statements can be executed as a single multi-statement batch
    const mPool = await getMSSQLPool();
    await mPool.request().query(schemaSql);
    
    console.log('[MSSQL] Microsoft SQL Server Database bootstrapping completed successfully.');
  } catch (err: any) {
    console.error('[MSSQL] Database initialization failed:', err.message);
  }
}
