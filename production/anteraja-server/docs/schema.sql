-- =============================================================================
-- ANTERAJA PHARMA - THERMAL SIMULATION DATABASE SCHEMA & SEED DATA
-- Dialect: PostgreSQL 12+ / Supabase
-- =============================================================================

-- Enable Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- DROP EXISTING TABLES (CLEANUP)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS simulation_time_series_logs CASCADE;
DROP TABLE IF EXISTS simulation_runs CASCADE;
DROP TABLE IF EXISTS scenario_corrective_actions CASCADE;
DROP TABLE IF EXISTS corrective_actions CASCADE;
DROP TABLE IF EXISTS disturbance_scenarios CASCADE;
DROP TABLE IF EXISTS transit_stage_logs CASCADE;
DROP TABLE IF EXISTS shipment_thermal_parameters CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- -----------------------------------------------------------------------------
-- 1. TABEL KATALOG PRODUK FARMASI (products) - FR-01
-- -----------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    min_temp_c NUMERIC(4,2) NOT NULL,
    max_temp_c NUMERIC(4,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_temp_range CHECK (max_temp_c > min_temp_c)
);

-- -----------------------------------------------------------------------------
-- 2. TABEL UTAMA PENGIRIMAN SAMPEL (shipments) - FR-01, FR-04
-- -----------------------------------------------------------------------------
CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    tracking_number VARCHAR(50) UNIQUE NOT NULL,
    current_stage VARCHAR(50) NOT NULL DEFAULT 'Preparation',
    status VARCHAR(30) NOT NULL DEFAULT 'In Transit',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_shipment_status CHECK (status IN ('In Transit', 'Completed', 'Excursion Detected', 'Cancelled'))
);

-- -----------------------------------------------------------------------------
-- 3. TABEL PARAMETER TERMAL ENCLOSURE (shipment_thermal_parameters) - FR-02 [1:1]
-- -----------------------------------------------------------------------------
CREATE TABLE shipment_thermal_parameters (
    shipment_id UUID PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
    mass_kg NUMERIC(6,3) NOT NULL DEFAULT 0.500,
    specific_heat_cp NUMERIC(8,2) NOT NULL DEFAULT 3800.00,
    conductance_ua NUMERIC(6,2) NOT NULL DEFAULT 1.20,
    h_product_air NUMERIC(6,2) NOT NULL DEFAULT 5.00,
    tau_sensor NUMERIC(6,2) NOT NULL DEFAULT 15.00,
    sensor_bias NUMERIC(4,2) NOT NULL DEFAULT 0.00,
    target_setpoint_c NUMERIC(4,2) NOT NULL DEFAULT 4.00,
    hysteresis_margin_c NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    CONSTRAINT check_mass CHECK (mass_kg > 0),
    CONSTRAINT check_cp CHECK (specific_heat_cp > 0),
    CONSTRAINT check_ua CHECK (conductance_ua > 0)
);

-- -----------------------------------------------------------------------------
-- 4. TABEL LOG TAHAPAN TRANSIT (transit_stage_logs) - FR-04 [1:N]
-- -----------------------------------------------------------------------------
CREATE TABLE transit_stage_logs (
    id BIGSERIAL PRIMARY KEY,
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    stage_name VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 5. TABEL SKENARIO GANGGUAN (disturbance_scenarios) - FR-03 [1:N]
-- -----------------------------------------------------------------------------
CREATE TABLE disturbance_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    scenario_type VARCHAR(50) NOT NULL,
    intensity_value NUMERIC(6,2) NOT NULL DEFAULT 1.00,
    duration_seconds INT NOT NULL DEFAULT 300,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT check_scenario_type CHECK (scenario_type IN ('Open Door', 'Power Loss', 'Weak Cooling', 'Sensor Drift'))
);

-- -----------------------------------------------------------------------------
-- 6. TABEL KATALOG TINDAKAN KOREKSI (corrective_actions) - FR-03
-- -----------------------------------------------------------------------------
CREATE TABLE corrective_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_name VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    parameter_modified VARCHAR(50) NOT NULL,
    description TEXT
);

-- -----------------------------------------------------------------------------
-- 7. TABEL PERSIMPANGAN SKENARIO vs KOREKSI (scenario_corrective_actions) - FR-03 [N:M]
-- -----------------------------------------------------------------------------
CREATE TABLE scenario_corrective_actions (
    scenario_id UUID NOT NULL REFERENCES disturbance_scenarios(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
    applied_at_step INT NOT NULL DEFAULT 0,
    PRIMARY KEY (scenario_id, action_id)
);

-- -----------------------------------------------------------------------------
-- 8. TABEL SESI EKSEKUSI SIMULASI (simulation_runs) - FR-02, FR-03 [1:N]
-- -----------------------------------------------------------------------------
CREATE TABLE simulation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    run_timestamp TIMESTAMPTZ DEFAULT NOW(),
    total_steps INT NOT NULL DEFAULT 600,
    has_excursion BOOLEAN DEFAULT FALSE,
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 9. TABEL TIME-SERIES SUHU (simulation_time_series_logs) - FR-02, FR-04 [1:N]
-- -----------------------------------------------------------------------------
CREATE TABLE simulation_time_series_logs (
    id BIGSERIAL PRIMARY KEY,
    simulation_run_id UUID NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
    step_seconds INT NOT NULL,
    air_temp_c NUMERIC(5,2) NOT NULL,
    product_temp_c NUMERIC(5,2) NOT NULL,
    sensor_temp_c NUMERIC(5,2) NOT NULL,
    q_cooling_active BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT check_step_positive CHECK (step_seconds >= 0)
);

-- INDEKS KINERJA QUERY
CREATE INDEX idx_shipments_product ON shipments(product_id);
CREATE INDEX idx_time_series_run ON simulation_time_series_logs(simulation_run_id, step_seconds);
CREATE INDEX idx_stage_logs_shipment ON transit_stage_logs(shipment_id);


-- =============================================================================
-- SAMPLE DATA DUMMY (SEED DATA)
-- =============================================================================

-- 1. Insert Products
INSERT INTO products (id, name, category, min_temp_c, max_temp_c) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Vaksin COVID-19 mRNA', 'Vaccine', 2.00, 8.00),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Insulin Human Regular', 'Hormone', 2.00, 8.00),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Reagen Biologis Lab', 'Reagent', 1.00, 5.00);

-- 2. Insert Shipments
INSERT INTO shipments (id, product_id, tracking_number, current_stage, status) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ANT-PHARMA-20260901', 'In Transit', 'In Transit'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'ANT-PHARMA-20260902', 'Loading', 'In Transit');

-- 3. Insert Thermal Parameters
INSERT INTO shipment_thermal_parameters (shipment_id, mass_kg, specific_heat_cp, conductance_ua, h_product_air, tau_sensor, sensor_bias, target_setpoint_c, hysteresis_margin_c) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 0.500, 3800.00, 1.20, 5.00, 15.00, 0.00, 4.00, 1.00),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 1.200, 4180.00, 0.85, 4.50, 20.00, 0.50, 5.00, 1.50);

-- 4. Insert Transit Stage Logs
INSERT INTO transit_stage_logs (shipment_id, stage_name, notes) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Preparation', 'Pemeriksaan awal suhu kemasan terisolasi.'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Loading', 'Penataan sampel vaksin ke dalam kontainer cold chain.'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'In Transit', 'Armada meninggalkan hub gudang utama.');

-- 5. Insert Disturbance Scenarios
INSERT INTO disturbance_scenarios (id, shipment_id, scenario_type, intensity_value, duration_seconds, is_active) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Open Door', 15.00, 120, TRUE),
('f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Power Loss', 0.00, 300, FALSE);

-- 6. Insert Corrective Actions
INSERT INTO corrective_actions (id, action_name, action_type, parameter_modified, description) VALUES
('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', 'Penutupan Pintu Container', 'Physical Intervention', 'Q_door', 'Menutup kembali pintu enclosure untuk menghentikan laju konveksi eksternal.'),
('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', 'Pemulihan Daya Listrik', 'Power Restoration', 'Q_cooling', 'Menyalakan kembali sumber daya pendinginan pendingin terisolasi.');

-- 7. Insert Junction N:M
INSERT INTO scenario_corrective_actions (scenario_id, action_id, applied_at_step) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', 60);

-- 8. Insert Simulation Run
INSERT INTO simulation_runs (id, shipment_id, total_steps, has_excursion, notes) VALUES
('r0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 300, FALSE, 'Simulasi pengujian skenario pintu terbuka selama 2 menit.');

-- 9. Insert Time-Series Logs
INSERT INTO simulation_time_series_logs (simulation_run_id, step_seconds, air_temp_c, product_temp_c, sensor_temp_c, q_cooling_active) VALUES
('r0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 0, 4.00, 4.00, 4.00, FALSE),
('r0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 1, 4.25, 4.01, 4.02, TRUE),
('r0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 2, 4.50, 4.03, 4.05, TRUE),
('r0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 3, 4.80, 4.05, 4.10, TRUE);
