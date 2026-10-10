/**
 * @deprecated Use `src/lib/storage.ts` diretamente.
 * Módulo adaptador mantido temporariamente para retrocompatibilidade sem dependências da AWS SDK.
 */
import { uploadFile, getDownloadUrl } from "./storage";

export async function uploadImageToS3(
  imageUri: string,
  fileName: string
): Promise<string> {
  return uploadFile(imageUri, fileName);
}

export async function getImageFromS3(key: string): Promise<string | null> {
  return getDownloadUrl(key);
}
