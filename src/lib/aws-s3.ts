import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import 'react-native-url-polyfill/auto';

const REGION = process.env.EXPO_PUBLIC_AWS_REGION || "us-east-1";
const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_BUCKET_NAME || "biogen-s3";

const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY || "",
        sessionToken: process.env.EXPO_PUBLIC_AWS_SESSION_TOKEN || ""
    }
});

export async function uploadImageToS3(imageUri: string, fileName: string) {
    try {
        console.log(`Iniciando o upload do arquivo: ${imageUri}`);

      
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: 'base64',
        });

        
        const ext = imageUri.substring(imageUri.lastIndexOf('.') + 1) || 'jpg';

       
        const arrayBuffer = decode(base64);
        const uint8Array = new Uint8Array(arrayBuffer);

        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: uint8Array,
            ContentType: `image/${ext}`
        };

        const command = new PutObjectCommand(uploadParams);

        console.log("Enviando para a AWS...");
        const response = await s3Client.send(command);

        console.log("✅ Upload realizado com sucesso!", response);

        return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileName}`;

    } catch (error) {
        console.error("❌ Erro ao fazer o upload para o S3:", error);
        throw error;
    }
}
