-- ==============================================================================
-- BioDash - Schema & Seed PostgreSQL (Azure Database for PostgreSQL Flexible Server)
-- Executado automaticamente pelo GitHub Actions CI/CD após o provisionamento IaC
-- 100% Idempotente: Tabelas usam IF NOT EXISTS e o Seed só roda se a base estiver vazia
-- ==============================================================================

-- Extensão para criptografia de senhas (bcrypt) e UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. USERS (Autenticação do Backend BioDashBD)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 2. USER_PROFILES (Perfis e Dados Cadastrais)
-- ==============================================================================
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

-- ==============================================================================
-- 3. BIODIGESTER_INDICATORS (Métricas e Telemetria de Biodigestores)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS biodigester_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  waste_processed NUMERIC DEFAULT 0,
  energy_generated NUMERIC DEFAULT 0,
  tax_savings NUMERIC DEFAULT 0,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. MAINTENANCE_SCHEDULES (Agendamentos Preventivos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  priority VARCHAR(50) DEFAULT 'low',
  status VARCHAR(50) DEFAULT 'pending',
  scheduled_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 5. MAINTENANCE_INCIDENTS (Incidentes e Ocorrências)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS maintenance_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  last_notification_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_email VARCHAR(255),
  resolution_message TEXT,
  status VARCHAR(50) DEFAULT 'pending'
);

-- Migrações idempotentes de colunas em manutenções (caso tabela já existisse)
ALTER TABLE maintenance_incidents ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE maintenance_incidents ADD COLUMN IF NOT EXISTS resolution_message TEXT;
ALTER TABLE maintenance_incidents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- ==============================================================================
-- 6. SENSOR_ALERTS (Alertas de Sensores IoT / Telemetria)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sensor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  alert_level VARCHAR(50) DEFAULT 'info',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. ACTIVITIES (Auditoria e Logs de Atividades do Dashboard)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. ÍNDICES DE DESEMPENHO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_indicators_user_id ON biodigester_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_indicators_measured_at ON biodigester_indicators(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_user_id ON maintenance_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_user_id ON sensor_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_created_at ON sensor_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp DESC);

-- ==============================================================================
-- 9. SEED CONDICIONAL INTELIGENTE (Executa APENAS se a tabela users estiver vazia)
-- ==============================================================================
DO $$
DECLARE
  v_biogen_id UUID;
  v_gueff_id UUID;
  i INT;
  v_date TIMESTAMPTZ;
BEGIN
  -- Se já houver qualquer usuário cadastrado, ignora o seed para preservar dados reais
  IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    RAISE NOTICE 'Base de dados vazia detectada. Executando seed inicial para demonstração...';

    -- 9.1 Usuários de Demonstração (senhas com hash bcrypt seguro)
    -- - biogen@gmail.com: Biogen123!
    -- - gueffmatheus@gmail.com: gueff12
    INSERT INTO users (email, password_hash)
    VALUES 
      ('biogen@gmail.com', crypt('Biogen123!', gen_salt('bf', 10))),
      ('gueffmatheus@gmail.com', crypt('gueff12', gen_salt('bf', 10)));

    SELECT id INTO v_biogen_id FROM users WHERE email = 'biogen@gmail.com';
    SELECT id INTO v_gueff_id FROM users WHERE email = 'gueffmatheus@gmail.com';

    -- 9.2 Perfis Completos
    INSERT INTO user_profiles (user_id, name, company, razao_social, cnpj, address, numero, city, state, zip_code, phone, email)
    VALUES
      (v_biogen_id, 'Administrador BioDash', 'BioDash Demo', 'Biogen Energia Renovável Ltda.', '12345678000190', 'Rua das Bioenergias', 42, 'São Paulo', 'SP', '01310100', '(11) 91234-5678', 'biogen@gmail.com'),
      (v_gueff_id, 'Matheus Gueff', 'BioDash Team', 'BioGen Fatec S/A', '98765432000100', 'Av. Tiradentes', 615, 'São Paulo', 'SP', '01101010', '(11) 98765-4321', 'gueffmatheus@gmail.com');

    -- 9.3 Histórico de 12 meses de Indicadores para visualização nos gráficos
    FOR i IN 0..11 LOOP
      v_date := NOW() - (i || ' months')::INTERVAL;
      INSERT INTO biodigester_indicators (user_id, waste_processed, energy_generated, tax_savings, measured_at)
      VALUES
        (v_biogen_id, 4200 - (i * 120), 1900 - (i * 55), 3100 - (i * 90), v_date),
        (v_gueff_id, 4500 - (i * 130), 2100 - (i * 60), 3400 - (i * 95), v_date);
    END LOOP;

    -- 9.4 Agendamentos de Manutenção Preventiva
    INSERT INTO maintenance_schedules (user_id, name, priority, status, scheduled_date)
    VALUES
      (v_biogen_id, 'Troca de filtros de carvão ativado', 'high', 'pending', NOW() + INTERVAL '7 days'),
      (v_biogen_id, 'Calibração dos sensores de CH4 e CO2', 'medium', 'pending', NOW() + INTERVAL '15 days'),
      (v_biogen_id, 'Inspeção do queimador e tocha de biogás', 'low', 'completed', NOW() - INTERVAL '10 days'),
      (v_gueff_id, 'Manutenção preventiva geral semestral', 'high', 'pending', NOW() + INTERVAL '12 days');

    -- 9.5 Ocorrências e Incidentes
    INSERT INTO maintenance_incidents (user_id, description, user_email, status, resolution_message)
    VALUES
      (v_biogen_id, 'Pressão anormal no manômetro da cúpula do digestor B1', 'biogen@gmail.com', 'pending', NULL),
      (v_gueff_id, 'Pequena oscilação de temperatura no sensor primário', 'gueffmatheus@gmail.com', 'resolved', 'Termostato ajustado e calibrado.');

    -- 9.6 Alertas de Sensores
    INSERT INTO sensor_alerts (user_id, alert_level, message)
    VALUES
      (v_biogen_id, 'warning', 'Concentração de H2S próxima ao limite operacional (180 ppm).'),
      (v_biogen_id, 'info', 'Produção diária de biogás atingiu a meta planejada (1.850 m³).'),
      (v_gueff_id, 'info', 'Sistema operando com eficiência de digestão anaeróbia em 94%.');

    -- 9.7 Auditoria e Atividades
    INSERT INTO activities (user_id, type, description, timestamp)
    VALUES
      (v_biogen_id, 'AUTH', 'Login no sistema realizado com sucesso', NOW()),
      (v_biogen_id, 'SYSTEM', 'Telemetria de sensores atualizada', NOW() - INTERVAL '1 hour'),
      (v_gueff_id, 'AUTH', 'Login no sistema realizado com sucesso', NOW());

    RAISE NOTICE '✅ Seed inicial de demonstração finalizado com sucesso!';
  ELSE
    RAISE NOTICE 'ℹ️ Tabela users já contém registros. Seed ignorado para preservar integridade dos dados.';
  END IF;
END $$;
