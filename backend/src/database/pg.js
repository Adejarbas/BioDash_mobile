/**
 * Pool compartilhado de PostgreSQL (RDS AWS)
 * Use este módulo em todas as rotas para evitar múltiplos pools.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,                   // máximo de conexões simultâneas
  idleTimeoutMillis: 30000,  // fecha conexões inativas após 30s
  connectionTimeoutMillis: 5000, // timeout ao tentar conectar
});

pool.on('connect', () => {
  console.log('🟢 Nova conexão ao PostgreSQL estabelecida');
});

pool.on('error', (err) => {
  console.error('🔴 Erro inesperado no pool do PostgreSQL:', err.message);
});

module.exports = pool;
