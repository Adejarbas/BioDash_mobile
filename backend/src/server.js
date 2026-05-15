require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Pool } = require('pg');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const indicatorsRoutes = require('./routes/indicators');
const maintenanceRoutes = require('./routes/maintenance');
const alertsRoutes = require('./routes/alerts');

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
const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

pgPool.connect()
  .then(() => console.log('🟢 Conectado ao PostgreSQL (AWS RDS)'))
  .catch((err) => console.error('🔴 Erro de conexão com PostgreSQL:', err));


// ==========================================
// Rotas de Autenticação e Dados (PostgreSQL)
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/indicators', indicatorsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/alerts', alertsRoutes);


// ==========================================
// Rotas - MongoDB (Mapas / Geolocalização)
// ==========================================
app.get('/api/markers', async (req, res) => {
  try {
    const markers = await Marker.find();
    res.json({ success: true, data: markers });
  } catch (error) {
    console.error('Erro ao buscar marcadores:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar marcadores' });
  }
});

app.post('/api/markers', async (req, res) => {
  try {
    // Verifica se é um update (tem id) ou insert
    if (req.body.id) {
      const updated = await Marker.findByIdAndUpdate(
        req.body.id,
        { title: req.body.title, latitude: req.body.latitude, longitude: req.body.longitude, description: req.body.description, address: req.body.address },
        { new: true }
      );
      return res.json({ success: true, data: updated });
    }
    const newMarker = new Marker(req.body);
    const saved = await newMarker.save();
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Erro ao salvar marcador:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar marcador' });
  }
});

app.delete('/api/markers/:id', async (req, res) => {
  try {
    await Marker.findByIdAndDelete(req.params.id);
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
  console.log(`🌐 Acesse pelo IP público: http://54.91.34.164:${port}/api`);
});
