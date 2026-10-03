require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const supabase = require('./lib/supabase');
// Pool PostgreSQL compartilhado — criado apenas uma vez aqui
const pgPool = require('./database/pg');

const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const indicatorsRoutes = require('./routes/indicators');
const maintenanceRoutes = require('./routes/maintenance');
const alertsRoutes = require('./routes/alerts');
const s3Routes = require('./routes/s3');

const app = express();
const port = process.env.PORT || 3003;

// CORS — aceita origens configuradas no .env ou libera tudo em dev
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origem (como aplicativos móveis nativos, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error(`CORS bloqueado para a origem: ${origin}`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true
}));
app.use(express.json());

// ==========================================
// 1. Conexão com PostgreSQL (Supabase - Dados Principais)
// ==========================================
pgPool.connect()
  .then(client => {
    client.release();
    console.log('🟢 Conectado ao PostgreSQL (AWS RDS)');
  })
  .catch((err) => console.error('🔴 Erro de conexão com PostgreSQL:', err.message));


// ==========================================
// Rotas de Autenticação e Dados (PostgreSQL)
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/indicators', indicatorsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/s3', s3Routes);

// ==========================================
// Health Check
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});


// ==========================================
// Rotas - Supabase (Mapas / Geolocalização)
// Tabela: biodigestor_maps (id, user_id uuid, address json, created_at)
// ==========================================

// GET /api/markers — retorna apenas os marcadores do usuário autenticado
app.get('/api/markers', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      'SELECT * FROM biodigestor_maps WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    // Normaliza para o formato esperado pelo frontend
    const markers = rows.map(row => ({
      _id: String(row.id),
      id: String(row.id),
      userId: row.user_id,
      title: row.address?.title || 'Biodigestor',
      latitude: row.address?.latitude || -14.235,
      longitude: row.address?.longitude || -51.925,
      description: row.address?.description || '',
      address: row.address || {},
      createdAt: row.created_at,
    }));

    res.json({ success: true, data: markers });
  } catch (error) {
    console.error('Erro ao buscar marcadores:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar marcadores' });
  }
});

// POST /api/markers — cria ou atualiza marcador vinculado ao usuário autenticado
app.post('/api/markers', authMiddleware, async (req, res) => {
  try {
    const addressPayload = {
      title: req.body.title,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      description: req.body.description || '',
      ...(req.body.address || {}),
    };

    // Atualização (tem id)
    if (req.body.id) {
      const checkRes = await pgPool.query(
        'SELECT id FROM biodigestor_maps WHERE id = $1 AND user_id = $2',
        [req.body.id, req.user.id]
      );

      if (checkRes.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Marcador não encontrado ou sem permissão.' });
      }

      const updateRes = await pgPool.query(
        'UPDATE biodigestor_maps SET address = $1 WHERE id = $2 RETURNING *',
        [addressPayload, req.body.id]
      );

      const updated = updateRes.rows[0];

      return res.json({
        success: true,
        data: {
          _id: String(updated.id),
          id: String(updated.id),
          userId: updated.user_id,
          ...addressPayload,
          address: addressPayload,
          createdAt: updated.created_at,
        }
      });
    }

    // Novo marcador
    const insertRes = await pgPool.query(
      'INSERT INTO biodigestor_maps (user_id, address) VALUES ($1, $2) RETURNING *',
      [req.user.id, addressPayload]
    );

    const inserted = insertRes.rows[0];

    res.json({
      success: true,
      data: {
        _id: String(inserted.id),
        id: String(inserted.id),
        userId: inserted.user_id,
        ...addressPayload,
        address: addressPayload,
        createdAt: inserted.created_at,
      }
    });
  } catch (error) {
    console.error('Erro ao salvar marcador:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar marcador' });
  }
});

// DELETE /api/markers/:id — remove marcador apenas se pertencer ao usuário autenticado
app.delete('/api/markers/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pgPool.query(
      'DELETE FROM biodigestor_maps WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Marcador não encontrado ou sem permissão.' });
    }

    res.json({ success: true, message: 'Marcador removido com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar marcador:', error);
    res.status(500).json({ success: false, message: 'Erro ao deletar marcador' });
  }
});


// ==========================================
// Inicialização do Servidor
// ==========================================
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend BioDash rodando em http://0.0.0.0:${port}`);
  console.log(`🌐 Acesse pelo domínio público: http://biodash-api.duckdns.org:${port}/api`);
});
