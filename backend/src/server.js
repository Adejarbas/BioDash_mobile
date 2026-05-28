require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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
  ? process.env.CORS_ORIGINS.split(',')
  : ['*'];

app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

// ==========================================
// 1. Conexão com MongoDB (EC2 - Geolocalização)
// URI sem autenticação, conforme configuração da EC2
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('🟢 Conectado ao MongoDB (AWS EC2)'))
  .catch((err) => console.error('🔴 Erro de conexão com MongoDB:', err));

// Schema e Modelo de Marcadores do Mapa
const markerSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // ← vínculo com o usuário autenticado
  title: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  description: { type: String, default: '' },
  address: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});
const Marker = mongoose.model('Marker', markerSchema);

// ==========================================
// 2. Conexão com PostgreSQL (RDS - Dados Principais)
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
// Rotas - MongoDB (Mapas / Geolocalização)
// ==========================================
// GET /api/markers — retorna apenas os marcadores do usuário autenticado
app.get('/api/markers', authMiddleware, async (req, res) => {
  try {
    const markers = await Marker.find({ userId: req.user.id });
    res.json({ success: true, data: markers });
  } catch (error) {
    console.error('Erro ao buscar marcadores:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar marcadores' });
  }
});

// POST /api/markers — cria ou atualiza marcador vinculado ao usuário autenticado
app.post('/api/markers', authMiddleware, async (req, res) => {
  try {
    // Verifica se é um update (tem id) e se pertence ao usuário
    if (req.body.id) {
      const existing = await Marker.findOne({ _id: req.body.id, userId: req.user.id });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Marcador não encontrado ou sem permissão.' });
      }
      const updated = await Marker.findByIdAndUpdate(
        req.body.id,
        { title: req.body.title, latitude: req.body.latitude, longitude: req.body.longitude, description: req.body.description, address: req.body.address },
        { new: true }
      );
      return res.json({ success: true, data: updated });
    }
    // Novo marcador — vincula ao usuário autenticado
    const newMarker = new Marker({ ...req.body, userId: req.user.id });
    const saved = await newMarker.save();
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Erro ao salvar marcador:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar marcador' });
  }
});

// DELETE /api/markers/:id — remove marcador apenas se pertencer ao usuário autenticado
app.delete('/api/markers/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Marker.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) {
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
  console.log(`🌐 Acesse pelo IP público: http://44.196.163.18:${port}/api`);
});
