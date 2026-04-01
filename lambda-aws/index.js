import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// Schema do MongoDB
const markerSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  rawAddress: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Marker = mongoose.models.Marker || mongoose.model('Marker', markerSchema);

let connection = null;

const connectDB = async () => {
  if (connection) return connection;
  if (!process.env.MONGODB_URI) {
    throw new Error('Defina a variável de ambiente MONGODB_URI');
  }
  connection = await mongoose.connect(process.env.MONGODB_URI);
  return connection;
};

// Helper: Extrai e valida o userId do JWT
const getUserId = (event) => {
  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    const secret = process.env.SUPABASE_JWT_SECRET;
    
    if (!secret) {
      console.error('SUPABASE_JWT_SECRET não está definida');
      return null;
    }

    const decoded = jwt.verify(token, secret);
    return decoded.sub; // 'sub' é o User ID no Supabase
  } catch (err) {
    console.error('Erro na validação do JWT:', err);
    return null;
  }
};

export const handler = async (event) => {
  // 1. Tratativa de CORS (Preflight OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return response(200, { message: 'CORS OK' });
  }

  await connectDB();

  // 2. Validação de Segurança
  const userId = getUserId(event);
  if (!userId) {
    return response(401, { message: 'Não autorizado: Token inválido ou ausente' });
  }

  const { httpMethod, pathParameters, body } = event;

  try {
    switch (httpMethod) {
      case 'GET':
        const markers = await Marker.find({ userId }).sort({ createdAt: -1 });
        return response(200, markers);

      case 'POST':
        const data = JSON.parse(body);
        
        // Segurança: Sobrescreve o userId com o ID real do token
        data.userId = userId;

        let savedMarker;
        // Mongoose usa _id nativamente
        if (data._id && mongoose.Types.ObjectId.isValid(data._id)) {
          savedMarker = await Marker.findByIdAndUpdate(
            data._id,
            { ...data, updatedAt: new Date() },
            { new: true, upsert: true }
          );
        } else {
          delete data._id; // Garante que o Mongo crie um novo ID limpo
          delete data.id;
          savedMarker = await Marker.create(data);
        }
        return response(201, savedMarker);

      case 'DELETE':
        const idToDelete = pathParameters?.id;
        if (!idToDelete) return response(400, { message: 'O id é obrigatório' });
        
        // Segurança dupla: O marker tem que existir E pertencer ao usuário
        const markerToDelete = await Marker.findOne({ _id: idToDelete, userId });
        if (!markerToDelete) {
          return response(404, { message: 'Marker não encontrado ou acesso negado' });
        }

        await Marker.deleteOne({ _id: idToDelete });
        return response(200, { message: 'Marker deletado com sucesso' });

      default:
        return response(405, { message: 'Método não permitido' });
    }
  } catch (error) {
    console.error('Erro na Lambda:', error);
    return response(500, { message: error.message });
  }
};

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  },
  body: JSON.stringify(body),
});