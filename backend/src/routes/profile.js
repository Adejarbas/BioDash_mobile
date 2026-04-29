const express = require('express');
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pgPool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar perfil.' });
  }
});

// PUT /api/profile
router.put('/', authMiddleware, async (req, res) => {
  const { name, company, razaoSocial, cnpj, address, numero, city, state, zipCode, phone, email, avatarUrl } = req.body;

  try {
    await pgPool.query(
      `INSERT INTO user_profiles (user_id, name, company, razao_social, cnpj, address, numero, city, state, zip_code, phone, email, avatar_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         name = COALESCE($2, user_profiles.name),
         company = COALESCE($3, user_profiles.company),
         razao_social = COALESCE($4, user_profiles.razao_social),
         cnpj = COALESCE($5, user_profiles.cnpj),
         address = COALESCE($6, user_profiles.address),
         numero = COALESCE($7, user_profiles.numero),
         city = COALESCE($8, user_profiles.city),
         state = COALESCE($9, user_profiles.state),
         zip_code = COALESCE($10, user_profiles.zip_code),
         phone = COALESCE($11, user_profiles.phone),
         email = COALESCE($12, user_profiles.email),
         avatar_url = COALESCE($13, user_profiles.avatar_url),
         updated_at = NOW()`,
      [req.user.id, name || null, company || null, razaoSocial || null, cnpj || null, address || null, numero ? parseInt(numero) : null, city || null, state || null, zipCode || null, phone || null, email || null, avatarUrl || null]
    );
    res.json({ success: true, message: 'Perfil atualizado com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ success: false, message: 'Erro ao atualizar perfil.' });
  }
});

module.exports = router;
