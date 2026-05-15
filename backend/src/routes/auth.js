const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'biodash_secret_change_in_production';
const SALT_ROUNDS = 10;

const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

// POST /api/auth/signup  (e alias /register para compatibilidade com o frontend)
async function handleSignup(req, res) {
  const { email, password, name, razaoSocial, cnpj, address, numero, zipCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });
  }

  try {
    // Verifica se já existe
    const existing = await pgPool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Este email já está cadastrado.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userResult = await pgPool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    // Cria o perfil associado
    await pgPool.query(
      `INSERT INTO user_profiles (user_id, name, razao_social, cnpj, address, numero, zip_code, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.id, name || null, razaoSocial || null, cnpj || null, address || null, numero ? parseInt(numero) : null, zipCode || null, email.toLowerCase()]
    );

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ success: true, data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
}

router.post('/signup', handleSignup);
router.post('/register', handleSignup); // alias para compatibilidade com o frontend



// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios.' });
  }

  try {
    const result = await pgPool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Email ou senha inválidos.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ success: true, data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await pgPool.query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

// PUT /api/auth/password
router.put('/password', require('../middleware/auth'), async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pgPool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.user.id]);
    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

module.exports = router;
