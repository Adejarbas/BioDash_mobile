# 📘 Guia de Execução: Migração AWS ➔ Azure (BioDash)

Este documento contém o plano passo a passo exato com todas as decisões arquiteturais, comandos e códigos para que qualquer agente de IA ou desenvolvedor consiga reproduzir integralmente as alterações dos **Marcos 1, 2 e 3**, além de preparar o **Marco 4**.

---

## 🧭 Visão Geral do Ecossistema

- **Repositórios/Pastas Envolvidas:**
  1. `BioDashBD` (Backend oficial em Next.js API Routes / TypeScript / Node.js)
  2. `BioDash_mobile` (Frontend Mobile/Web em Expo / React Native)
  3. `BioDash_ai-service` (Microsserviço Python FastAPI + Faster-Whisper + LangChain)
- **Branch Ativa:** `feat/azure-integration`
- **Regras Estritas:**
  - **NÃO fazer `git commit`** a menos que o usuário solicite explicitamente.
  - **FinOps Azure for Students:** Proibido o uso de Azure Container Registry (ACR) e AKS por estouro de créditos. O provisionamento e imagens devem usar Docker Hub ou GHCR.

---

## 📌 Marco 1: Auditoria de Lock-in de Nuvem

### 1.1. Objetivo
Mapear e documentar todos os pontos em que a aplicação dependia da AWS (S3, EC2, RDS, IAM Instance Role, variáveis de ambiente).

### 1.2. Ação Realizada
Criar o relatório técnico detalhado em:
`BioDash_mobile/docs/lockin-audit.md`

O documento deve abordar:
- Introdução e contexto acadêmico (Fatec).
- Mapeamento de acoplamento (`@aws-sdk/client-s3`, strings fixas `amazonaws.com/`).
- Framework dos 6 R's de Migração (S3: *Refactor*, RDS: *Replatform*, EC2: *Replatform* para Container Apps, OTel: *Refactor*).
- Diagramas Mermaid da arquitetura AWS (anterior) e da arquitetura Azure (alvo).
- FinOps com cota zero de estudante.

---

## 📌 Marco 2: Ports & Adapters de Storage (Desacoplamento de Nuvem)

### 2.1. No Backend (`BioDashBD`)

#### Passo 1: Instalar Dependências
No diretório `BioDashBD`:
```bash
cmd.exe /c npm install @azure/storage-blob @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

#### Passo 2: Criar a Porta de Domínio (`IFileStoragePort`)
Arquivo: `lib/storage/ports/storage.port.ts`
```typescript
export interface UploadUrlResult {
  uploadUrl: string;
  key: string;
  publicUrl?: string;
  expiresInSeconds?: number;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  key: string;
  expiresInSeconds?: number;
}

export interface IFileStoragePort {
  readonly providerName: string;
  generateUploadUrl(fileName: string, contentType: string, userId: string): Promise<UploadUrlResult>;
  generateDownloadUrl(key: string, expiresInSeconds?: number): Promise<DownloadUrlResult>;
  deleteFile(key: string): Promise<boolean>;
}
```

#### Passo 3: Criar o Adaptador Azure Blob Storage
Arquivo: `lib/storage/adapters/azure-blob.adapter.ts`
- Utiliza `@azure/storage-blob`.
- Gera **SAS Tokens** com `BlobSASPermissions.parse("cw")` para upload (`PUT`) e `BlobSASPermissions.parse("r")` para download (`GET`).
- Suporta tanto `AZURE_STORAGE_CONNECTION_STRING` quanto `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCOUNT_KEY`.
- Container padrão: `biogen-avatars`.

#### Passo 4: Criar o Adaptador AWS S3 (Legado de Referência)
Arquivo: `lib/storage/adapters/aws-s3.adapter.ts`
- Utiliza `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner`.
- Gera Presigned URLs via `PutObjectCommand` e `GetObjectCommand`.

#### Passo 5: Criar a Factory com Injeção Dinâmica
Arquivo: `lib/storage/storage.factory.ts`
```typescript
import { IFileStoragePort } from './ports/storage.port';
import { AzureBlobStorageAdapter } from './adapters/azure-blob.adapter';
import { AwsS3StorageAdapter } from './adapters/aws-s3.adapter';

let instance: IFileStoragePort | null = null;

export function getStorageService(): IFileStoragePort {
  if (instance) return instance;
  const provider = (process.env.STORAGE_PROVIDER || 'azure').toLowerCase().trim();

  if (provider === 'aws' || provider === 's3') {
    instance = new AwsS3StorageAdapter();
  } else {
    instance = new AzureBlobStorageAdapter();
  }
  return instance;
}
```

#### Passo 6: Criar as Rotas HTTP Agnósticas e Legadas
- `app/api/storage/upload-url/route.ts` (POST - Requer JWT, gera URL de upload via `storage.generateUploadUrl`)
- `app/api/storage/download-url/route.ts` (GET - Requer JWT, parâmetro `key`, gera URL via `storage.generateDownloadUrl`)
- `app/api/s3/upload-url/route.ts`:
  ```typescript
  export { runtime, POST } from "@/app/api/storage/upload-url/route";
  ```
- `app/api/s3/download-url/route.ts`:
  ```typescript
  export { runtime, GET } from "@/app/api/storage/download-url/route";
  ```

---

### 2.2. No Frontend Mobile (`BioDash_mobile`)

#### Passo 1: Criar o Cliente Universal de Storage
Arquivo: `src/lib/storage.ts`
- Faz a requisição para `/api/storage/upload-url` (com fallback para `/api/s3/upload-url`).
- Converte o arquivo para blob ou bytes binários decodificados via `base64-arraybuffer`.
- Faz o `fetch(uploadUrl, { method: 'PUT', ... })`.
- **Regra da Azure:** Se a URL contiver `.blob.core.windows.net`, adiciona o cabeçalho obrigatório:
  `'x-ms-blob-type': 'BlockBlob'`.
- Implementa `getDownloadUrl(key)` chamando `/api/storage/download-url?key=...`.

#### Passo 2: Atualizar Fachada de Compatibilidade
Arquivo: `src/lib/aws-s3.ts`
- Substitui a implementação legada por chamadas para `uploadFile` e `getDownloadUrl` de `./storage`.

#### Passo 3: Refatorar Telas que Acessavam Storage
Arquivo: `src/screens/CompanyProfileScreen.tsx`
- Importar `uploadFile, getDownloadUrl` de `../lib/storage`.
- Substituir checagem hardcoded de `amazonaws.com/` por parsing compatível com Azure Blob:
  ```typescript
  let key = profile.avatar_url;
  if (key.includes('amazonaws.com/')) {
    key = key.split('amazonaws.com/')[1];
  } else if (key.includes('.blob.core.windows.net/')) {
    const urlObj = new URL(key);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    key = parts.slice(1).join('/');
  }
  const downloadUrl = await getDownloadUrl(key);
  if (downloadUrl) setAvatarUri(downloadUrl);
  ```
- No método `uploadAvatar`, usar `await uploadFile(uri, fileName)` e `profileApi.update({ avatarUrl: key })`.

---

## 📌 Marco 3: Gestão de Imagens Docker e Microsserviço de IA

### 3.1. Isolamento do Microsserviço `BioDash_ai-service`
- O microsserviço de Chatbot/Whisper foi extraído para repositório independente em:
  `c:\Projetos\Fatec\BioGen\BioDash_ai-service`
- Foi configurado com `uv` (`pyproject.toml`), `Dockerfile`, e action de CI/CD para compilação e publicação automática no Docker Hub:
  `mathgueff/biodash_ai-service:latest`
- As pastas mortas `backend/` e `ai-service/` dentro de `BioDash_mobile` foram removidas do repositório mobile.

### 3.2. Padronização de Variáveis de Ambiente
- Padronizada a variável `EXPO_PUBLIC_API_URL` em todo o `BioDash_mobile` (substituindo duplicações de `EXPO_PUBLIC_NEXT_API_URL`).
- `.env` do mobile reduzido a apenas 3 variáveis:
  ```env
  EXPO_PUBLIC_SUPABASE_URL=...
  EXPO_PUBLIC_SUPABASE_ANON_KEY=...
  EXPO_PUBLIC_API_URL=http://localhost:3003/api
  ```

---

## 📌 Marco 4: Instrumentação OpenTelemetry (OTel) — Próximo Passo

### 4.1. No Backend (`BioDashBD`)
1. Instalar SDK OpenTelemetry:
   ```bash
   cmd.exe /c npm install @azure/monitor-opentelemetry @opentelemetry/sdk-node
   ```
2. Criar inicializador em `lib/telemetry/tracing.ts` ativado antes do bootstrap da aplicação.
3. Configurar leitura da variável de ambiente:
   `APPLICATIONINSIGHTS_CONNECTION_STRING`
4. Conectar o Winston Logger (`lib/logger-winston.js`) ao trace context do OTel.

---

## 🔍 Comandos de Validação de Tipos (TypeScript)

Para assegurar 0 erros de compilação:
```bash
# No BioDashBD:
cmd.exe /c npx tsc --noEmit

# No BioDash_mobile:
cmd.exe /c npx tsc --noEmit
```

