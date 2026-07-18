-- ====================================================================
-- EXTRUSION PRODUCTION MANAGEMENT DATABASE SCHEMA (MICROSOFT SQL SERVER)
-- ====================================================================

-- 🇧🇩 ডাটাবেজ তৈরি এবং ব্যবহার করার কুয়েরি (SSMS-এ সরাসরি রান করতে পারেন):
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'Extrusion_DB')
BEGIN
    CREATE DATABASE Extrusion_DB;
END;
GO

USE Extrusion_DB;
GO

-- ====================================================================
-- 🇧🇩 বাংলায় নির্দেশাবলী (Bangla Instructions):
-- 1. প্রথমে আপনার SQL Server Management Studio (SSMS) ওপেন করুন।
-- 2. একটি নতুন কুয়েরি উইন্ডো খুলুন (New Query)।
-- 3. এই ফাইলের সম্পূর্ণ কুয়েরি কপি করে রান (Execute অথবা F5) করুন।
--    এটি স্বয়ংক্রিয়ভাবে 'Extrusion_DB' ডাটাবেজ তৈরি করবে, সেটিতে সুইচ করবে এবং সমস্ত টেবিল 
--    (app_config, operators, machines, pending_orders, production_records, machine_logs, machine_daily_stats) 
--    তৈরি করে প্রাথমিক ডেমো ডাটা ইনসার্ট করবে।
-- ====================================================================
-- 🇬🇧 English Instructions:
-- 1. Open SQL Server Management Studio (SSMS).
-- 2. Open a New Query window.
-- 3. Copy and run this entire script (Execute or F5).
--    It will automatically create the 'Extrusion_DB' database, select it, 
--    create all tables, and seed initial values.
-- ====================================================================

-- 1. Table: app_config
IF OBJECT_ID('dbo.app_config', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.app_config (
        config_key VARCHAR(100) PRIMARY KEY,
        config_value NVARCHAR(MAX) NOT NULL
    );
END;

-- Seed Initial App Config (T-SQL format)
IF NOT EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'roll_settings')
BEGIN
    INSERT INTO dbo.app_config (config_key, config_value) 
    VALUES ('roll_settings', '{"LAST_ROLL_NO": 0, "PREFIX": "EXT", "CURRENT_YEAR": "2026"}');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'sample_settings')
BEGIN
    INSERT INTO dbo.app_config (config_key, config_value) 
    VALUES ('sample_settings', '{"LAST_SAMPLE_SERIAL": 0}');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.app_config WHERE config_key = 'dropdowns')
BEGIN
    INSERT INTO dbo.app_config (config_key, config_value) 
    VALUES ('dropdowns', '{"shifts": ["Day", "Night", "A", "B", "C"], "productionTypes": ["Commercial", "R&D", "Trial", "Sample"], "uoms": ["Kgs", "Rolls", "Meter", "INCH"], "materials": ["LDPE", "HDPE", "LLDPE", "PP", "BOPP"], "inlinePrintOptions": ["Yes", "No"], "years": ["2023", "2024", "2025", "2026", "2027"], "breakdownReasons": ["Mechanical", "Electrical", "Pneumatic", "Hydraulic", "Sensor Failure", "Heater Band Burnout"], "idleReasons": ["No Material", "No Operator", "Power Interruption", "Core Shortage", "Routine Clean-up", "Awaiting Maintenance Handover"]}');
END;


-- Reference Tables for Dropdowns
-- Table 1: ref_shifts
IF OBJECT_ID('dbo.ref_shifts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_shifts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_shifts)
BEGIN
    INSERT INTO dbo.ref_shifts (val) VALUES ('Day'), ('Night'), ('A'), ('B'), ('C');
END;

-- Table 2: ref_production_types
IF OBJECT_ID('dbo.ref_production_types', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_production_types (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_production_types)
BEGIN
    INSERT INTO dbo.ref_production_types (val) VALUES ('Commercial'), ('R&D'), ('Trial'), ('Sample');
END;

-- Table 3: ref_uoms
IF OBJECT_ID('dbo.ref_uoms', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_uoms (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_uoms)
BEGIN
    INSERT INTO dbo.ref_uoms (val) VALUES ('Kgs'), ('Rolls'), ('Meter'), ('INCH');
END;

-- Table 4: ref_materials
IF OBJECT_ID('dbo.ref_materials', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_materials (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_materials)
BEGIN
    INSERT INTO dbo.ref_materials (val) VALUES ('LDPE'), ('HDPE'), ('LLDPE'), ('PP'), ('BOPP');
END;

-- Table 5: ref_inline_print_options
IF OBJECT_ID('dbo.ref_inline_print_options', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_inline_print_options (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_inline_print_options)
BEGIN
    INSERT INTO dbo.ref_inline_print_options (val) VALUES ('Yes'), ('No');
END;

-- Table 6: ref_years
IF OBJECT_ID('dbo.ref_years', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_years (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_years)
BEGIN
    INSERT INTO dbo.ref_years (val) VALUES ('2023'), ('2024'), ('2025'), ('2026'), ('2027');
END;

-- Table 7: ref_breakdown_reasons
IF OBJECT_ID('dbo.ref_breakdown_reasons', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_breakdown_reasons (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_breakdown_reasons)
BEGIN
    INSERT INTO dbo.ref_breakdown_reasons (val) VALUES ('Mechanical'), ('Electrical'), ('Pneumatic'), ('Hydraulic'), ('Sensor Failure'), ('Heater Band Burnout');
END;

-- Table 8: ref_idle_reasons
IF OBJECT_ID('dbo.ref_idle_reasons', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_idle_reasons (
        id INT IDENTITY(1,1) PRIMARY KEY,
        val VARCHAR(100) NOT NULL UNIQUE
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.ref_idle_reasons)
BEGIN
    INSERT INTO dbo.ref_idle_reasons (val) VALUES ('No Material'), ('No Operator'), ('Power Interruption'), ('Core Shortage'), ('Routine Clean-up'), ('Awaiting Maintenance Handover');
END;


-- 2. Table: operators
IF OBJECT_ID('dbo.operators', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.operators (
        operator_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150),
        created_at DATETIME2 DEFAULT GETDATE()
    );
END;

-- Seed Operators
IF NOT EXISTS (SELECT 1 FROM dbo.operators WHERE operator_id = 'OP001')
BEGIN
    INSERT INTO dbo.operators (operator_id, name, email) VALUES 
    ('OP001', 'Abul Kalam', 'kalam@extrusion.com');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.operators WHERE operator_id = 'OP002')
BEGIN
    INSERT INTO dbo.operators (operator_id, name, email) VALUES 
    ('OP002', 'Rahim Uddin', 'rahim@extrusion.com');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.operators WHERE operator_id = 'OP003')
BEGIN
    INSERT INTO dbo.operators (operator_id, name, email) VALUES 
    ('OP003', 'Milon Hossain', 'milon@extrusion.com');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.operators WHERE operator_id = 'OP004')
BEGIN
    INSERT INTO dbo.operators (operator_id, name, email) VALUES 
    ('OP004', 'Siddique Rahman', 'siddique@extrusion.com');
END;


-- 3. Table: machines
IF OBJECT_ID('dbo.machines', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.machines (
        machine_no VARCHAR(50) PRIMARY KEY,
        type VARCHAR(100),
        target_kgs DECIMAL(12,2) DEFAULT 0.00,
        status VARCHAR(50) DEFAULT 'Running',
        reason NVARCHAR(MAX),
        num_idle INT DEFAULT 0,
        num_breakdown INT DEFAULT 0,
        idle_time DECIMAL(12,2) DEFAULT 0.00,
        breakdown_time DECIMAL(12,2) DEFAULT 0.00,
        last_status_change DATETIME2 DEFAULT GETDATE()
    );
END;

-- Seed Machines
IF NOT EXISTS (SELECT 1 FROM dbo.machines WHERE machine_no = 'M-01')
BEGIN
    INSERT INTO dbo.machines (machine_no, type, target_kgs, status, reason, last_status_change) VALUES 
    ('M-01', 'Blown Film Extrusion', 800.00, 'Running', '', GETDATE());
END;

IF NOT EXISTS (SELECT 1 FROM dbo.machines WHERE machine_no = 'M-02')
BEGIN
    INSERT INTO dbo.machines (machine_no, type, target_kgs, status, reason, last_status_change) VALUES 
    ('M-02', 'Blown Film Extrusion', 1000.00, 'Running', '', GETDATE());
END;

IF NOT EXISTS (SELECT 1 FROM dbo.machines WHERE machine_no = 'M-03')
BEGIN
    INSERT INTO dbo.machines (machine_no, type, target_kgs, status, reason, last_status_change) VALUES 
    ('M-03', 'Co-Extrusion', 1200.00, 'Running', '', GETDATE());
END;

IF NOT EXISTS (SELECT 1 FROM dbo.machines WHERE machine_no = 'M-04')
BEGIN
    INSERT INTO dbo.machines (machine_no, type, target_kgs, status, reason, last_status_change) VALUES 
    ('M-04', 'Blown Film Extrusion', 800.00, 'Running', '', GETDATE());
END;

IF NOT EXISTS (SELECT 1 FROM dbo.machines WHERE machine_no = 'M-05')
BEGIN
    INSERT INTO dbo.machines (machine_no, type, target_kgs, status, reason, last_status_change) VALUES 
    ('M-05', 'Monolayer Extrusion', 600.00, 'Running', '', GETDATE());
END;


-- 4. Table: pending_orders
IF OBJECT_ID('dbo.pending_orders', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.pending_orders (
        pi_number VARCHAR(100) PRIMARY KEY,
        retailer VARCHAR(150),
        customer VARCHAR(150),
        imported_at DATETIME2 DEFAULT GETDATE()
    );
END;


-- 5. Table: production_records
IF OBJECT_ID('dbo.production_records', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.production_records (
        roll_id VARCHAR(100) PRIMARY KEY,
        production_date DATE NOT NULL,
        shift VARCHAR(50) NOT NULL,
        production_type VARCHAR(100),
        operator_id VARCHAR(50) FOREIGN KEY REFERENCES dbo.operators(operator_id) ON DELETE SET NULL,
        operator_name VARCHAR(100) NOT NULL,
        machine_no VARCHAR(50) FOREIGN KEY REFERENCES dbo.machines(machine_no) ON DELETE SET NULL,
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
        data_update_time DATETIME2 DEFAULT GETDATE(),
        fingerprint VARCHAR(50),
        entered_by VARCHAR(100) DEFAULT 'Plant Admin',
        production_year VARCHAR(10),
        production_month VARCHAR(20),
        retailer VARCHAR(150),
        customer VARCHAR(150),
        entry_timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

-- Indexes for production_records in T-SQL
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_date' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_date ON dbo.production_records(production_date);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_machine' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_machine ON dbo.production_records(machine_no);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_pi' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_pi ON dbo.production_records(pi_number);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_entry_timestamp' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_entry_timestamp ON dbo.production_records(entry_timestamp DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_type' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_type ON dbo.production_records(production_type);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_operator' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_operator ON dbo.production_records(operator_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_prod_operator_name' AND object_id = OBJECT_ID('dbo.production_records'))
    CREATE INDEX idx_prod_operator_name ON dbo.production_records(operator_name);


-- 6. Table: machine_logs
IF OBJECT_ID('dbo.machine_logs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.machine_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        machine_no VARCHAR(50) FOREIGN KEY REFERENCES dbo.machines(machine_no) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        start_time DATETIME2 NOT NULL,
        end_time DATETIME2,
        duration_mins DECIMAL(12,2) DEFAULT 0.00,
        reason NVARCHAR(MAX),
        breakdown_type VARCHAR(100)
    );
END;

-- Indexes for machine_logs in T-SQL
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_mlogs_machine' AND object_id = OBJECT_ID('dbo.machine_logs'))
    CREATE INDEX idx_mlogs_machine ON dbo.machine_logs(machine_no);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_mlogs_status' AND object_id = OBJECT_ID('dbo.machine_logs'))
    CREATE INDEX idx_mlogs_status ON dbo.machine_logs(status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_mlogs_times' AND object_id = OBJECT_ID('dbo.machine_logs'))
    CREATE INDEX idx_mlogs_times ON dbo.machine_logs(start_time DESC, end_time);


-- 7. Table: machine_daily_stats
IF OBJECT_ID('dbo.machine_daily_stats', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.machine_daily_stats (
        id INT IDENTITY(1,1) PRIMARY KEY,
        date DATE NOT NULL,
        machine_no VARCHAR(50) FOREIGN KEY REFERENCES dbo.machines(machine_no) ON DELETE CASCADE,
        target_kgs DECIMAL(12,2) DEFAULT 0.00,
        total_rolls INT DEFAULT 0,
        total_meter DECIMAL(12,2) DEFAULT 0.00,
        total_production_kgs DECIMAL(12,2) DEFAULT 0.00,
        idle_time_mins DECIMAL(12,2) DEFAULT 0.00,
        breakdown_time_mins DECIMAL(12,2) DEFAULT 0.00,
        num_idle INT DEFAULT 0,
        num_breakdown INT DEFAULT 0,
        reason_of_idle NVARCHAR(MAX),
        breakdown_type VARCHAR(100),
        last_update_time DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT UC_MachineDailyStats UNIQUE (date, machine_no)
    );
END;

-- Indexes for machine_daily_stats in T-SQL
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_mstats_date' AND object_id = OBJECT_ID('dbo.machine_daily_stats'))
    CREATE INDEX idx_mstats_date ON dbo.machine_daily_stats(date);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_mstats_machine' AND object_id = OBJECT_ID('dbo.machine_daily_stats'))
    CREATE INDEX idx_mstats_machine ON dbo.machine_daily_stats(machine_no);
