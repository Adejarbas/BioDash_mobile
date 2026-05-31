/**
 * aws-s3.ts — Upload/Download via Backend (IAM Instance Role)
 *
 * A EC2 que roda o Express backend possui uma IAM Instance Role com permissão
 * ao S3. O frontend NÃO usa credenciais AWS diretamente — apenas solicita
 * URLs pré-assinadas ao backend e usa essas URLs para upload/download.
 *
 * Fluxo:
 *  1. Frontend pede URL de upload ao backend → POST /api/s3/upload-url
 *  2. Backend gera URL pré-assinada usando a Instance Role
 *  3. Frontend faz PUT diretamente no S3 com essa URL
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://biodash-api.duckdns.org:3003/api';

const TOKEN_KEY = '@biodash_jwt_token';

async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Faz upload de uma imagem para o S3 via URL pré-assinada do backend.
 * @param imageUri URI local da imagem (file:// ou blob:)
 * @param fileName Nome do arquivo a ser enviado
 * @returns Chave (key) do objeto no S3
 */
export async function uploadImageToS3(imageUri: string, fileName: string): Promise<string> {
  const token = await getAuthToken();
  if (!token) throw new Error('Usuário não autenticado.');

  // Determina o contentType pela extensão
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  // 1. Solicita URL de upload pré-assinada ao backend
  const res = await fetch(`${API_BASE_URL}/s3/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileName, contentType }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Erro ao obter URL de upload.');
  }

  const { uploadUrl, key } = json.data;

  // 2. Converte a imagem para ArrayBuffer
  let body: Uint8Array;
  if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
    const response = await fetch(imageUri);
    const arrayBuffer = await response.arrayBuffer();
    body = new Uint8Array(arrayBuffer);
  } else {
    const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
    body = new Uint8Array(decode(base64));
  }

  // 3. Faz o PUT direto no S3 com a URL pré-assinada
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });

  if (!uploadRes.ok) {
    throw new Error(`Erro no upload S3: ${uploadRes.status}`);
  }

  console.log('✅ Upload S3 realizado com sucesso! Key:', key);
  return key;
}

/**
 * Obtém URL pré-assinada de leitura para uma imagem no S3.
 * @param key Chave do objeto no S3
 * @returns URL temporária válida por 1 hora
 */
export async function getImageFromS3(key: string): Promise<string | null> {
  if (!key) return null;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `${API_BASE_URL}/s3/download-url?key=${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const json = await res.json();
    if (!res.ok || !json.success) return null;

    return json.data.downloadUrl;
  } catch (err) {
    console.error('❌ Erro ao obter URL de download S3:', err);
    return null;
  }
}
