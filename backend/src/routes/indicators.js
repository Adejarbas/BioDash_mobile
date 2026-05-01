const express = require('express');
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/indicators — Busca todos os indicadores do usuário (últimos 13 meses)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 13);
    const result = await pgPool.query(
      `SELECT * FROM biodigester_indicators
       WHERE user_id = $1 AND measured_at >= $2
       ORDER BY measured_at DESC`,
      [req.user.id, since.toISOString()]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar indicadores:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar indicadores.' });
  }
});

// POST /api/indicators — Cria ou atualiza (upsert por mês/ano)
router.post('/', authMiddleware, async (req, res) => {
  const { wasteProcessed, energyGenerated, taxSavings, month, year } = req.body;

  try {
    const monthIdx = parseInt(month);
    const yearVal = parseInt(year);
    const measuredAt = new Date(yearVal, monthIdx, 15).toISOString();
    const startDate = new Date(yearVal, monthIdx, 1).toISOString();
    const endDate = new Date(yearVal, monthIdx + 1, 0, 23, 59, 59).toISOString();

    // Verifica se já existe registro para este mês/ano
    const existing = await pgPool.query(
      `SELECT id FROM biodigester_indicators
       WHERE user_id = $1 AND measured_at >= $2 AND measured_at <= $3
       LIMIT 1`,
      [req.user.id, startDate, endDate]
    );

    if (existing.rows.length > 0) {
      await pgPool.query(
        `UPDATE biodigester_indicators
         SET waste_processed = $1, energy_generated = $2, tax_savings = $3, measured_at = $4
         WHERE id = $5`,
        [wasteProcessed || 0, energyGenerated || 0, taxSavings || 0, measuredAt, existing.rows[0].id]
      );
    } else {
      await pgPool.query(
        `INSERT INTO biodigester_indicators (user_id, waste_processed, energy_generated, tax_savings, measured_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, wasteProcessed || 0, energyGenerated || 0, taxSavings || 0, measuredAt]
      );
    }

    res.json({ success: true, message: 'Indicador salvo com sucesso.' });
  } catch (err) {
    console.error('Erro ao salvar indicador:', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar indicador.' });
  }
});

module.exports = router;
