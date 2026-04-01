import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// MongoDB Marker Schema
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

let connection: any = null;

const connectDB = async () => {
  if (connection) return connection;
  if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }
  connection = await mongoose.connect(process.env.MONGODB_URI);
  return connection;
};

// Helper: Extract and validate userId from JWT
const getUserId = (event: any): string | null => {
  try {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    const secret = process.env.SUPABASE_JWT_SECRET;
    
    if (!secret) {
      console.error('SUPABASE_JWT_SECRET is not defined');
      return null;
    }

    const decoded: any = jwt.verify(token, secret);
    return decoded.sub; // 'sub' field in Supabase JWT is the User ID
  } catch (err) {
    console.error('JWT Validation Error:', err);
    return null;
  }
};

export const handler = async (event: any) => {
  await connectDB();

  const userId = getUserId(event);
  if (!userId) {
    return response(401, { message: 'Unauthorized: Invalid or missing token' });
  }

  const { httpMethod, pathParameters, body } = event;

  try {
    switch (httpMethod) {
      case 'GET':
        const markers = await Marker.find({ userId }).sort({ createdAt: -1 });
        return response(200, markers);

      case 'POST':
        const data = JSON.parse(body);
        
        // Always override userId with the one from the token for security
        data.userId = userId;

        let savedMarker;
        if (data.id && mongoose.Types.ObjectId.isValid(data.id)) {
          savedMarker = await Marker.findByIdAndUpdate(data.id,
            { ...data, updatedAt: new Date() },
            { new: true, upsert: true }
          );
        } else {
          // Remove id if it's not a valid ObjectId (e.g., from Supabase SQL id)
          delete data.id;
          savedMarker = await Marker.create(data);
        }
        return response(201, savedMarker);

      case 'DELETE':
        const idToDelete = pathParameters?.id;
        if (!idToDelete) return response(400, { message: 'id is required' });
        
        // Ensure the user owns the marker before deleting
        const markerToDelete = await Marker.findOne({ _id: idToDelete, userId });
        if (!markerToDelete) {
          return response(404, { message: 'Marker not found or access denied' });
        }

        await Marker.deleteOne({ _id: idToDelete });
        return response(200, { message: 'Marker deleted successfully' });

      default:
        return response(405, { message: 'Method Not Allowed' });
    }
  } catch (error: any) {
    console.error('Lambda Error:', error);
    return response(500, { message: error.message });
  }
};

const response = (statusCode: number, body: any) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  },
  body: JSON.stringify(body),
});
