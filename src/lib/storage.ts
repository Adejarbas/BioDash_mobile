/**
 * storage.ts — Cliente Universal de Armazenamento de Arquivos
 *
 * Desacoplado de nuvem específica: comunica-se com as rotas agnósticas do backend
 * (/api/storage/upload-url e /api/storage/download-url).
 * Suporta Microsoft Azure Blob Storage (com cabeçalho obrigatório x-ms-blob-type: BlockBlob).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3003/api";

const TOKEN_KEY = "@biodash_jwt_token";

async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Realiza upload de um arquivo via URL pré-assinada (SAS Token) fornecida pelo backend.
 * @param fileUri URI local do arquivo (file:// ou blob:)
 * @param fileName Nome do arquivo a ser gravado
 * @returns Chave (key) identificadora do arquivo no storage
 */
export async function uploadFile(
  fileUri: string,
  fileName: string
): Promise<string> {
  const token = await getAuthToken();
  if (!token) throw new Error("Usuário não autenticado.");

  // Determina o contentType pela extensão
  const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
  const contentTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  const contentType = contentTypes[ext] || "application/octet-stream";

  // 1. Solicita URL de upload ao backend (/api/storage/upload-url com fallback para /api/s3/upload-url)
  let res = await fetch(`${API_BASE_URL}/storage/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fileName, contentType }),
  });

  if (!res.ok) {
    // Fallback legado caso o endpoint /api/storage ainda não esteja disponível
    res = await fetch(`${API_BASE_URL}/s3/upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fileName, contentType }),
    });
  }

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || "Erro ao obter URL de upload.");
  }

  const { uploadUrl, key } = json.data;

  // 2. Converte o arquivo para ArrayBuffer/Uint8Array
  let body: Uint8Array;
  if (fileUri.startsWith("blob:") || fileUri.startsWith("http")) {
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    body = new Uint8Array(arrayBuffer);
  } else {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: "base64",
    });
    body = new Uint8Array(decode(base64));
  }

  // 3. Monta cabeçalhos de envio
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  // Se o destino for o Azure Blob Storage, o cabeçalho x-ms-blob-type é obrigatório para BlockBlob
  if (uploadUrl.includes(".blob.core.windows.net")) {
    headers["x-ms-blob-type"] = "BlockBlob";
  }

  // 4. Executa PUT direto no Storage Provider
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: body as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    throw new Error(`Erro no envio para o storage: status ${uploadRes.status}`);
  }

  console.log("✅ Upload concluído com sucesso! Key:", key);
  return key;
}

/**
 * Obtém URL temporária para leitura/download de um arquivo armazenado.
 * @param key Chave identificadora do arquivo
 * @returns URL de download com token temporário
 */
export async function getDownloadUrl(key: string): Promise<string | null> {
  if (!key) return null;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    let res = await fetch(
      `${API_BASE_URL}/storage/download-url?key=${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      // Fallback legado
      res = await fetch(
        `${API_BASE_URL}/s3/download-url?key=${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }

    const json = await res.json();
    if (!res.ok || !json.success) return null;

    return json.data.downloadUrl;
  } catch (err) {
    console.error("❌ Erro ao obter URL de download do storage:", err);
    return null;
  }
}
