const express = require('express');
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/alerts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT * FROM sensor_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar alertas:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar alertas.' });
  }
});

// POST /api/alerts
router.post('/', authMiddleware, async (req, res) => {
  const { alertLevel, message } = req.body;
  try {
    const result = await pgPool.query(
      `INSERT INTO sensor_alerts (user_id, alert_level, message) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, alertLevel || 'info', message]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erro ao criar alerta:', err);
    res.status(500).json({ success: false, message: 'Erro ao criar alerta.' });
  }
});

module.exports = router;
