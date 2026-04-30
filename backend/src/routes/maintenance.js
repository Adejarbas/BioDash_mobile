const express = require('express');
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/maintenance/schedules
router.get('/schedules', authMiddleware, async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT * FROM maintenance_schedules WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar manutenções:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar manutenções.' });
  }
});

// POST /api/maintenance/schedules
router.post('/schedules', authMiddleware, async (req, res) => {
  const { name, priority, scheduledDate } = req.body;
  try {
    const result = await pgPool.query(
      `INSERT INTO maintenance_schedules (user_id, name, priority, status, scheduled_date)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [req.user.id, name, priority || 'low', scheduledDate]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erro ao criar manutenção:', err);
    res.status(500).json({ success: false, message: 'Erro ao criar manutenção.' });
  }
});

// PUT /api/maintenance/schedules/:id
router.put('/schedules/:id', authMiddleware, async (req, res) => {
  const { status } = req.body;
  try {
    await pgPool.query(
      `UPDATE maintenance_schedules SET status = $1 WHERE id = $2 AND user_id = $3`,
      [status, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Manutenção atualizada.' });
  } catch (err) {
    console.error('Erro ao atualizar manutenção:', err);
    res.status(500).json({ success: false, message: 'Erro ao atualizar manutenção.' });
  }
});

// DELETE /api/maintenance/schedules/:id
router.delete('/schedules/:id', authMiddleware, async (req, res) => {
  try {
    await pgPool.query(
      `DELETE FROM maintenance_schedules WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Manutenção apagada.' });
  } catch (err) {
    console.error('Erro ao apagar manutenção:', err);
    res.status(500).json({ success: false, message: 'Erro ao apagar manutenção.' });
  }
});

// GET /api/maintenance/incidents — Busca incidente ativo (últimas 48h)
router.get('/incidents', authMiddleware, async (req, res) => {
  try {
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = await pgPool.query(
      `SELECT * FROM maintenance_incidents
       WHERE user_id = $1 AND last_notification_at >= $2
       ORDER BY created_at ASC LIMIT 1`,
      [req.user.id, since48h]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    console.error('Erro ao buscar incidentes:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar incidentes.' });
  }
});

// PUT /api/maintenance/incidents/active — Resolve o incidente pendente
router.put('/incidents/active', authMiddleware, async (req, res) => {
  const { resolution_message } = req.body;
  console.log(resolution_message)
  try {
    // Atualiza o incidente pendente mais recente do usuário
    await pgPool.query(
      `UPDATE maintenance_incidents 
       SET resolution_message = $1, status = 'resolved', updated_at = NOW()
       WHERE user_id = $2 AND (status = 'pending' OR status IS NULL OR resolution_message IS NULL)`,
      [resolution_message, req.user.id]
    );
    res.json({ success: true, message: 'Incidente resolvido com sucesso.' });
  } catch (err) {
    console.error('Erro ao resolver incidente:', err);
    res.status(500).json({ success: false, message: 'Erro ao resolver incidente.' });
  }
});

module.exports = router;
