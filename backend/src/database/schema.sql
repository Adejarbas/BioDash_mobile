-- ============================================================
-- BioDash - Schema PostgreSQL (AWS RDS)
-- Execute este script no seu banco de dados PostgreSQL
-- ============================================================

-- Extensão para gerar UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS (substitui supabase.auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER_PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  company VARCHAR(255),
  razao_social VARCHAR(255),
  cnpj VARCHAR(20),
  address TEXT,
  numero INTEGER,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  phone VARCHAR(30),
  email VARCHAR(255),
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BIODIGESTER_INDICATORS
-- ============================================================
CREATE TABLE IF NOT EXISTS biodigester_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  waste_processed NUMERIC DEFAULT 0,
  energy_generated NUMERIC DEFAULT 0,
  tax_savings NUMERIC DEFAULT 0,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MAINTENANCE_SCHEDULES
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  priority VARCHAR(50) DEFAULT 'low',
  status VARCHAR(50) DEFAULT 'pending',
  scheduled_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MAINTENANCE_INCIDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  last_notification_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SENSOR_ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS sensor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alert_level VARCHAR(50) DEFAULT 'info',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_indicators_user_id ON biodigester_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_indicators_measured_at ON biodigester_indicators(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_user_id ON maintenance_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_user_id ON sensor_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_created_at ON sensor_alerts(created_at DESC);
