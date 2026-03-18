import mongoose from 'mongoose';

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

export const handler = async (event: any) => {
  await connectDB();

  const { httpMethod, pathParameters, body, queryStringParameters } = event;
  const userId = queryStringParameters?.userId || (body ? JSON.parse(body).userId : null);

  try {
    switch (httpMethod) {
      case 'GET':
        if (!userId) return response(400, { message: 'userId is required' });
        const markers = await Marker.find({ userId }).sort({ createdAt: -1 });
        return response(200, markers);

      case 'POST':
        const data = JSON.parse(body);
        if (!data.userId) return response(400, { message: 'userId is required' });

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
        await Marker.findByIdAndDelete(idToDelete);
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
    'Access-Control-Allow-Origin': '*', // Enable CORS
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  },
  body: JSON.stringify(body),
});
