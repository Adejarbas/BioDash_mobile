const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: 'server/.env' });

const PORT = Number(process.env.PORT || 3003);
const NODE_ENV = process.env.NODE_ENV || 'development';
const USE_IN_MEMORY_DB = String(process.env.USE_IN_MEMORY_DB || '').toLowerCase() === 'true';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'biodash';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'map_history';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltam variaveis obrigatorias no server/.env (SUPABASE_URL, SUPABASE_ANON_KEY).');
}

if (!USE_IN_MEMORY_DB && !MONGODB_URI) {
  throw new Error('MONGODB_URI e obrigatoria quando USE_IN_MEMORY_DB=false.');
}

const app = express();

const allowList = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowList.length === 0 || allowList.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem nao permitida por CORS'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));

const supabaseServer = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

const mongoClient = new MongoClient(MONGODB_URI, {
  maxPoolSize: 20,
  minPoolSize: 2,
});

let mapHistoryCollection;
const inMemoryMapHistory = new Map();

function inMemoryGetUserMarkers(userId) {
  return inMemoryMapHistory.get(userId) || [];
}

function inMemoryUpsertUserMarker(user, marker, nowIso) {
  const current = inMemoryGetUserMarkers(user.id);
  const index = current.findIndex((item) => item.markerId === marker.id);

  const doc = {
    userId: user.id,
    userEmail: user.email || null,
    markerId: marker.id,
    title: marker.title,
    description: marker.description,
    latitude: marker.latitude,
    longitude: marker.longitude,
    updatedAt: nowIso,
    createdAt: index >= 0 ? current[index].createdAt : nowIso,
  };

  if (index >= 0) {
    current[index] = doc;
  } else {
    current.push(doc);
  }

  current.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  inMemoryMapHistory.set(user.id, current);
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Token de autenticacao ausente.' });
    }

    const { data, error } = await supabaseServer.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: 'Token invalido ou expirado.' });
    }

    req.user = data.user;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Falha na autenticacao.' });
  }
}

function normalizeMarker(marker = {}) {
  const id = String(marker.id || '').trim();
  const latitude = Number(marker.latitude);
  const longitude = Number(marker.longitude);
  const title = String(marker.title || '').trim();
  const description = String(marker.description || '').trim();

  if (!id) throw new Error('Campo marker.id e obrigatorio.');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Latitude invalida.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Longitude invalida.');

  return {
    id,
    latitude,
    longitude,
    title: title || 'Marcador',
    description,
  };
}

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    env: NODE_ENV,
    now: new Date().toISOString(),
  });
});

app.get('/api/map-history', authMiddleware, async (req, res) => {
  try {
    const docs = USE_IN_MEMORY_DB
      ? inMemoryGetUserMarkers(req.user.id).slice(0, 500)
      : await mapHistoryCollection
        .find({ userId: req.user.id })
        .project({ _id: 0, markerId: 1, latitude: 1, longitude: 1, title: 1, description: 1, createdAt: 1 })
        .sort({ createdAt: 1 })
        .limit(500)
        .toArray();

    const markers = docs.map((doc) => ({
      id: doc.markerId,
      latitude: Number(doc.latitude),
      longitude: Number(doc.longitude),
      title: doc.title || 'Marcador',
      description: doc.description || '',
    }));

    return res.json({ success: true, data: markers });
  } catch (err) {
    console.error('GET /api/map-history error:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao buscar historico.' });
  }
});

app.post('/api/map-history', authMiddleware, async (req, res) => {
  try {
    const marker = normalizeMarker(req.body?.marker || {});
    const now = new Date().toISOString();

    if (USE_IN_MEMORY_DB) {
      inMemoryUpsertUserMarker(req.user, marker, now);
    } else {
      await mapHistoryCollection.updateOne(
        { userId: req.user.id, markerId: marker.id },
        {
          $set: {
            userEmail: req.user.email || null,
            title: marker.title,
            description: marker.description,
            latitude: marker.latitude,
            longitude: marker.longitude,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: req.user.id,
            markerId: marker.id,
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }

    return res.status(201).json({ success: true, data: { persisted: true } });
  } catch (err) {
    const status = String(err?.message || '').includes('obrigatorio') || String(err?.message || '').includes('invalida') ? 400 : 500;
    if (status === 500) {
      console.error('POST /api/map-history error:', err);
    }
    return res.status(status).json({ success: false, message: err?.message || 'Erro interno ao salvar historico.' });
  }
});

async function bootstrap() {
  if (!USE_IN_MEMORY_DB) {
    await mongoClient.connect();
    const db = mongoClient.db(MONGODB_DATABASE);
    mapHistoryCollection = db.collection(MONGODB_COLLECTION);

    await mapHistoryCollection.createIndex({ userId: 1, createdAt: -1 });
    await mapHistoryCollection.createIndex({ userId: 1, markerId: 1 }, { unique: true });
  }

  app.listen(PORT, () => {
    const mode = USE_IN_MEMORY_DB ? 'IN_MEMORY_DB' : 'MONGODB';
    console.log(`[BioDash API] Online em http://localhost:${PORT} | modo=${mode}`);
  });
}

bootstrap().catch((err) => {
  console.error('Falha ao iniciar API:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  if (!USE_IN_MEMORY_DB) {
    await mongoClient.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (!USE_IN_MEMORY_DB) {
    await mongoClient.close();
  }
  process.exit(0);
});
