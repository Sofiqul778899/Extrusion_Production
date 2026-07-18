-- ====================================================================
-- EXTRUSION PRODUCTION MANAGEMENT DATABASE SCHEMA (POSTGRESQL - DEFAULT)
-- ====================================================================
-- Note: If you are using MICROSOFT SQL SERVER (SSMS), please close this file
-- and open /mssql_schema.sql instead! Do NOT execute this PostgreSQL file in SSMS.
-- ====================================================================

-- --------------------------------------------------------------------
-- Table: app_config (Holds roll settings, prefixes, etc.)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value JSONB NOT NULL
);

-- Seed Initial App Config
INSERT INTO app_config (config_key, config_value) VALUES 
('roll_settings', '{"LAST_ROLL_NO": 0, "PREFIX": "EXT", "CURRENT_YEAR": "2026"}')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO app_config (config_key, config_value) VALUES 
('sample_settings', '{"LAST_SAMPLE_SERIAL": 0}')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO app_config (config_key, config_value) VALUES 
('dropdowns', '{"shifts": ["Day", "Night", "A", "B", "C"], "productionTypes": ["Commercial", "R&D", "Trial", "Sample"], "uoms": ["Kgs", "Rolls", "Meter", "INCH"], "materials": ["LDPE", "HDPE", "LLDPE", "PP", "BOPP"], "inlinePrintOptions": ["Yes", "No"], "years": ["2023", "2024", "2025", "2026", "2027"], "breakdownReasons": ["Mechanical", "Electrical", "Pneumatic", "Hydraulic", "Sensor Failure", "Heater Band Burnout"], "idleReasons": ["No Material", "No Operator", "Power Interruption", "Core Shortage", "Routine Clean-up", "Awaiting Maintenance Handover"]}')
ON CONFLICT (config_key) DO NOTHING;


-- --------------------------------------------------------------------
-- Reference Tables (dropdowns in separate tables)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_shifts (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_production_types (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_uoms (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_materials (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_inline_print_options (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_years (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_breakdown_reasons (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_idle_reasons (
    id SERIAL PRIMARY KEY,
    val VARCHAR(100) NOT NULL UNIQUE
);

-- Seed Reference Data
INSERT INTO ref_shifts (val) VALUES ('Day'), ('Night'), ('A'), ('B'), ('C') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_production_types (val) VALUES ('Commercial'), ('R&D'), ('Trial'), ('Sample') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_uoms (val) VALUES ('Kgs'), ('Rolls'), ('Meter'), ('INCH') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_materials (val) VALUES ('LDPE'), ('HDPE'), ('LLDPE'), ('PP'), ('BOPP') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_inline_print_options (val) VALUES ('Yes'), ('No') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_years (val) VALUES ('2023'), ('2024'), ('2025'), ('2026'), ('2027') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_breakdown_reasons (val) VALUES ('Mechanical'), ('Electrical'), ('Pneumatic'), ('Hydraulic'), ('Sensor Failure'), ('Heater Band Burnout') ON CONFLICT (val) DO NOTHING;
INSERT INTO ref_idle_reasons (val) VALUES ('No Material'), ('No Operator'), ('Power Interruption'), ('Core Shortage'), ('Routine Clean-up'), ('Awaiting Maintenance Handover') ON CONFLICT (val) DO NOTHING;


-- --------------------------------------------------------------------
-- Table: operators (Operator Master Data)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
    operator_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Operators
INSERT INTO operators (operator_id, name, email) VALUES 
('OP001', 'Abul Kalam', 'kalam@extrusion.com'),
('OP002', 'Rahim Uddin', 'rahim@extrusion.com'),
('OP003', 'Milon Hossain', 'milon@extrusion.com'),
('OP004', 'Siddique Rahman', 'siddique@extrusion.com')
ON CONFLICT (operator_id) DO NOTHING;


-- --------------------------------------------------------------------
-- Table: machines (Machine Master Data & Status Tracker)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machines (
    machine_no VARCHAR(50) PRIMARY KEY,
    type VARCHAR(100),
    target_kgs DECIMAL(12,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Running', -- 'Running', 'Idle', 'Breakdown'
    reason TEXT,
    num_idle INT DEFAULT 0,
    num_breakdown INT DEFAULT 0,
    idle_time DECIMAL(12,2) DEFAULT 0.00,
    breakdown_time DECIMAL(12,2) DEFAULT 0.00,
    last_status_change TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Machines
INSERT INTO machines (machine_no, type, target_kgs, status, reason, last_status_change) VALUES 
('M-01', 'Blown Film Extrusion', 800.00, 'Running', '', CURRENT_TIMESTAMP),
('M-02', 'Blown Film Extrusion', 1000.00, 'Running', '', CURRENT_TIMESTAMP),
('M-03', 'Co-Extrusion', 1200.00, 'Running', '', CURRENT_TIMESTAMP),
('M-04', 'Blown Film Extrusion', 800.00, 'Running', '', CURRENT_TIMESTAMP),
('M-05', 'Monolayer Extrusion', 600.00, 'Running', '', CURRENT_TIMESTAMP)
ON CONFLICT (machine_no) DO NOTHING;


-- --------------------------------------------------------------------
-- Table: pending_orders (Product Master & PI Orders List)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_orders (
    pi_number VARCHAR(100) PRIMARY KEY,
    retailer VARCHAR(150),
    customer VARCHAR(150),
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- --------------------------------------------------------------------
-- Table: production_records (Production Entry Logs)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_records (
    roll_id VARCHAR(100) PRIMARY KEY,
    production_date DATE NOT NULL,
    shift VARCHAR(50) NOT NULL,
    production_type VARCHAR(100),
    operator_id VARCHAR(50) REFERENCES operators(operator_id) ON DELETE SET NULL,
    operator_name VARCHAR(100) NOT NULL,
    machine_no VARCHAR(50) REFERENCES machines(machine_no) ON DELETE SET NULL,
    year VARCHAR(10),
    pi_number VARCHAR(100),
    tube_size VARCHAR(50),
    uom VARCHAR(20),
    material VARCHAR(100),
    micron VARCHAR(50),
    in_line_print VARCHAR(10),
    finished_meter DECIMAL(12,2) DEFAULT 0.00,
    finished_kgs DECIMAL(12,2) DEFAULT 0.00,
    roll_location VARCHAR(100),
    scrap_kgs DECIMAL(12,2) DEFAULT 0.00,
    machine_status VARCHAR(50) DEFAULT 'Running',
    data_update_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fingerprint VARCHAR(50),
    entered_by VARCHAR(100) DEFAULT 'Plant Admin',
    production_year VARCHAR(10),
    production_month VARCHAR(20),
    retailer VARCHAR(150),
    customer VARCHAR(150),
    entry_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance optimized querying
CREATE INDEX IF NOT EXISTS idx_prod_date ON production_records(production_date);
CREATE INDEX IF NOT EXISTS idx_prod_machine ON production_records(machine_no);
CREATE INDEX IF NOT EXISTS idx_prod_pi ON production_records(pi_number);
CREATE INDEX IF NOT EXISTS idx_prod_entry_timestamp ON production_records(entry_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_prod_type ON production_records(production_type);
CREATE INDEX IF NOT EXISTS idx_prod_operator ON production_records(operator_id);
CREATE INDEX IF NOT EXISTS idx_prod_operator_name ON production_records(operator_name);


-- --------------------------------------------------------------------
-- Table: machine_logs (State logs: Downtimes / Idle / Breakdown events)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machine_logs (
    id SERIAL PRIMARY KEY,
    machine_no VARCHAR(50) REFERENCES machines(machine_no) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_mins DECIMAL(12,2) DEFAULT 0.00,
    reason TEXT,
    breakdown_type VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_mlogs_machine ON machine_logs(machine_no);
CREATE INDEX IF NOT EXISTS idx_mlogs_status ON machine_logs(status);
CREATE INDEX IF NOT EXISTS idx_mlogs_times ON machine_logs(start_time DESC, end_time);


-- --------------------------------------------------------------------
-- Table: machine_daily_stats (Daily dashboard summaries & targets)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS machine_daily_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    machine_no VARCHAR(50) REFERENCES machines(machine_no) ON DELETE CASCADE,
    target_kgs DECIMAL(12,2) DEFAULT 0.00,
    total_rolls INT DEFAULT 0,
    total_meter DECIMAL(12,2) DEFAULT 0.00,
    total_production_kgs DECIMAL(12,2) DEFAULT 0.00,
    idle_time_mins DECIMAL(12,2) DEFAULT 0.00,
    breakdown_time_mins DECIMAL(12,2) DEFAULT 0.00,
    num_idle INT DEFAULT 0,
    num_breakdown INT DEFAULT 0,
    reason_of_idle TEXT,
    breakdown_type VARCHAR(100),
    last_update_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, machine_no)
);

CREATE INDEX IF NOT EXISTS idx_mstats_date ON machine_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_mstats_machine ON machine_daily_stats(machine_no);
