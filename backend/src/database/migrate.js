const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function runSchema() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('🔄 Executando schema no PostgreSQL RDS...');
    await pool.query(sql);
    console.log('✅ Schema criado com sucesso! Todas as tabelas estão prontas.');
  } catch (err) {
    console.error('❌ Erro ao executar schema:', err.message);
  } finally {
    await pool.end();
  }
}

runSchema();
