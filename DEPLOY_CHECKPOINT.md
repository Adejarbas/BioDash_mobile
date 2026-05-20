# 📦 BioDash — Checkpoint de Deploy AWS
> Última atualização: 2026-05-20 | Gerado por Antigravity AI
> **Para continuar: leia este arquivo do início ao fim antes de fazer qualquer coisa.**

---

## 🗺️ Arquitetura Final Definida

```
[Usuário]
    │
    ├─→ http://54.85.37.127          → EC2 Frontend (Expo Web + Nginx, porta 80)
    │                                     BioDash_mobile (este repositório)
    │
    └─→ http://98.92.12.89           → EC2 Backend — dois containers:
           ├── porta 80  → Next.js Dashboard   (repositório BioDashBD)
           └── porta 3003 → Express API        (BioDash_mobile/backend/)
                               ├── PostgreSQL RDS (database-1.cej6...rds:5432)
                               ├── MongoDB EC2  (3.84.153.49:27017, sem auth)
                               └── AWS S3       (bucket: biogen-s3, via IAM Role)
```

| Serviço | Repositório | EC2 IP | Porta | Imagem Docker |
|---|---|---|---|---|
| Frontend Expo/Nginx | `BioDash_mobile` | `54.85.37.127` | `80` | `thiagohmn93/biodash_mobile:latest` |
| Express API | `BioDash_mobile/backend/` | `98.92.12.89` | `3003` | `thiagohmn93/biodash_backend:latest` |
| Next.js Dashboard | `BioDashBD` | `98.92.12.89` | `80` | `danielrodriguesadejarbas/biodash-backend:latest` |

---

## ✅ O Que Já Foi Feito (Código Corrigido)

Todos os arquivos abaixo já foram alterados e estão no repositório. Não precisa refazer.

### `BioDash_mobile` — Alterações

| Arquivo | O que mudou |
|---|---|
| `src/lib/api.ts` | IP fallback: `3.80.238.82` → `98.92.12.89` |
| `src/lib/auth.ts` | IP fallback: `3.80.238.82` → `98.92.12.89` |
| `src/lib/aws-s3.ts` | **Reescrito** — usa pre-signed URLs do backend (sem Access Keys no frontend) |
| `backend/src/server.js` | Rota `/api/s3` registrada; log do IP atualizado |
| `backend/src/routes/s3.js` | **Novo** — gera URLs pre-assinadas para upload/download S3 |
| `backend/package.json` | Dependências `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` adicionadas |
| `backend/.env` | **Criado** — contém POSTGRES_URL, MONGODB_URI, JWT_SECRET, CORS_ORIGINS, AWS_REGION, S3_BUCKET_NAME |
| `.env` | Atualizado — `EXPO_PUBLIC_API_URL` apontando para novo IP; credenciais AWS removidas |
| `docker-compose.yml` | Porta frontend corrigida: `8080:80` → `80:80`; IPs atualizados |
| `docker-compose.frontend.yml` | **Novo** — só o frontend; usar na EC2 `54.85.37.127` |
| `docker-compose.backend.yml` | **Novo** — só o Express; usar na EC2 `98.92.12.89` |
| `.github/workflows/mobile-ci-cd.yml` | `build-args` corrigido: Supabase → `EXPO_PUBLIC_API_URL` |

### `BioDashBD` — Alterações

| Arquivo | O que mudou |
|---|---|
| `middleware.ts` | CORS atualizado: IPs antigos → `54.85.37.127` e `98.92.12.89` |
| `next.config.js` | IPs de CORS atualizados |
| `docker-compose.yml` | Porta: `3003:3003` → `80:3003`; `NEXT_PUBLIC_SITE_URL` sem porta |
| `Dockerfile` | `EXPOSE 3003` (porta interna); healthcheck corrigido |

---

## ⏳ O Que AINDA FALTA Fazer

### PASSO 1 — GitHub Actions Secrets (20 minutos)

> Sem isso o CI/CD não consegue fazer push das imagens Docker.

#### Repositório `BioDash_mobile`
Acesse: `github.com/Adejarbas/BioDash_mobile` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| ☐ | Nome da Secret | Valor |
|---|---|---|
| `[ ]` | `DOCKERHUB_USERNAME` | `thiagohmn93` |
| `[ ]` | `DOCKERHUB_TOKEN` | *(gerar em hub.docker.com → Account Settings → Security → New Access Token)* |
| `[ ]` | `EXPO_PUBLIC_API_URL` | `http://98.92.12.89:3003/api` |

#### Repositório `BioDashBD`
Acesse: `github.com/Adejarbas/BioDashBD` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| ☐ | Nome da Secret | Valor |
|---|---|---|
| `[ ]` | `DOCKERHUB_USERNAME` | `thiagohmn93` |
| `[ ]` | `DOCKERHUB_TOKEN` | *(mesmo token gerado acima)* |
| `[ ]` | `POSTGRES_URL` | `postgresql://postgres:Biogen123!@database-1.cej6asnixj7d.us-east-1.rds.amazonaws.com:5432/postgres` |
| `[ ]` | `JWT_SECRET` | `biodash_jwt_secret_2024_change_in_production` |
| `[ ]` | `FRONTEND_URL` | `http://54.85.37.127` |
| `[ ]` | `NEXT_PUBLIC_API_BASE_URL` | `http://98.92.12.89:3003` |

---

### PASSO 2 — IAM Instance Role para S3 (10 minutos)

> Conta AWS Academy não permite Access Keys permanentes. A EC2 do backend usa uma Role para acessar o S3 automaticamente — sem nenhuma chave no código.

#### 2.1 — Criar a Policy
1. AWS Console → buscar **IAM** → **Policies** → **Create policy**
2. Clicar na aba **JSON**, apagar tudo e colar:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::biogen-s3/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::biogen-s3"
    }
  ]
}
```
3. Clicar **Next** → **Policy name**: `BioDashS3Policy` → **Create policy**

#### 2.2 — Criar a Role
1. IAM → **Roles** → **Create role**
2. **Trusted entity type**: `AWS service`
3. **Use case**: buscar e selecionar `EC2`
4. Clicar **Next**
5. Buscar e marcar: `BioDashS3Policy`
6. Clicar **Next** → **Role name**: `BioDashEC2Role` → **Create role**

#### 2.3 — Associar Role à EC2 do Backend
1. AWS Console → **EC2** → **Instances**
2. Selecionar a instância com IP `98.92.12.89`
3. **Actions** → **Security** → **Modify IAM role**
4. Selecionar `BioDashEC2Role` → **Update IAM role**

---

### PASSO 3 — Gerar as Imagens Docker (CI/CD automático)

Após configurar as Secrets, fazer push para `main` nos dois repositórios:

```bash
# No repositório BioDash_mobile
git add .
git commit -m "feat: configuração AWS deploy"
git push origin main

# No repositório BioDashBD
git add .
git commit -m "feat: configuração AWS deploy"
git push origin main
```

O GitHub Actions vai automaticamente:
1. Calcular a versão (semver)
2. Fazer build das imagens Docker
3. Fazer push para o Docker Hub

Acompanhe em: `github.com/Adejarbas/[REPO]/actions`

---

### PASSO 4 — Deploy nas EC2s (via SSH)

#### 4.1 — Instalar Docker nas EC2s (se ainda não instalado)

```bash
# Executar em AMBAS as EC2s
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user
# Reconectar via SSH após o usermod

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 4.2 — EC2 Frontend (`54.85.37.127`) — porta 80

```bash
ssh -i sua-chave.pem ec2-user@54.85.37.127

docker login -u thiagohmn93

docker pull thiagohmn93/biodash_mobile:latest

docker run -d \
  --name biodash_mobile_web \
  --restart unless-stopped \
  -p 80:80 \
  thiagohmn93/biodash_mobile:latest

# Verificar
docker ps
curl http://localhost:80
```

#### 4.3 — EC2 Backend (`98.92.12.89`) — portas 3003 e 80

```bash
ssh -i sua-chave.pem ec2-user@98.92.12.89

docker login -u thiagohmn93

# --- Container 1: Express API (porta 3003) ---
docker pull thiagohmn93/biodash_backend:latest

docker run -d \
  --name biodash_backend \
  --restart unless-stopped \
  -p 3003:3003 \
  -e PORT=3003 \
  -e NODE_ENV=production \
  -e POSTGRES_URL="postgresql://postgres:Biogen123!@database-1.cej6asnixj7d.us-east-1.rds.amazonaws.com:5432/postgres" \
  -e MONGODB_URI="mongodb://3.84.153.49:27017/biodash" \
  -e JWT_SECRET="biodash_jwt_secret_2024_change_in_production" \
  -e CORS_ORIGINS="http://54.85.37.127,http://54.85.37.127:80,http://98.92.12.89,http://98.92.12.89:3003" \
  -e AWS_REGION="us-east-1" \
  -e S3_BUCKET_NAME="biogen-s3" \
  thiagohmn93/biodash_backend:latest

# --- Container 2: Next.js Dashboard (porta 80) ---
docker pull danielrodriguesadejarbas/biodash-backend:latest

docker run -d \
  --name biodash_nextjs \
  --restart unless-stopped \
  -p 80:3003 \
  -e NODE_ENV=production \
  -e POSTGRES_URL="postgresql://postgres:Biogen123!@database-1.cej6asnixj7d.us-east-1.rds.amazonaws.com:5432/postgres" \
  -e JWT_SECRET="biodash_jwt_secret_2024_change_in_production" \
  -e FRONTEND_URL="http://54.85.37.127" \
  -e NEXT_PUBLIC_FRONTEND_URL="http://54.85.37.127" \
  -e NEXT_PUBLIC_API_BASE_URL="http://98.92.12.89:3003" \
  -e NEXT_PUBLIC_SITE_URL="http://98.92.12.89" \
  danielrodriguesadejarbas/biodash-backend:latest

# Verificar os dois containers
docker ps
curl http://localhost:3003/api/health
curl http://localhost:80/api/health
```

#### 4.4 — Ver logs em caso de erro

```bash
docker logs biodash_backend --tail 100
docker logs biodash_nextjs --tail 100
docker logs biodash_mobile_web --tail 100

# Reiniciar um container
docker restart biodash_backend
```

---

## 🔑 Senhas e Credenciais de Referência

> Guarde estas informações em local seguro.

| O quê | Valor |
|---|---|
| PostgreSQL senha | `Biogen123!` |
| PostgreSQL host | `database-1.cej6asnixj7d.us-east-1.rds.amazonaws.com:5432` |
| MongoDB IP | `3.84.153.49:27017` (sem autenticação) |
| JWT Secret | `biodash_jwt_secret_2024_change_in_production` |
| S3 Bucket | `biogen-s3` (região `us-east-1`) |
| Docker Hub user | `thiagohmn93` |

---

## 🧪 Checklist de Verificação Final

Após o deploy completo, testar:

```
[ ] http://54.85.37.127          → Deve abrir o app BioDash (tela de login)
[ ] http://98.92.12.89:3003/api/health → {"status":"ok",...}
[ ] http://98.92.12.89/api/health      → {"status":"ok",...}
[ ] Login no app com email/senha       → deve autenticar via JWT
[ ] Mapa de geolocalização             → deve carregar marcadores do MongoDB
[ ] Upload de foto de perfil           → deve funcionar via S3
```

---

## ❓ Perguntas em Aberto

Nenhuma. Tudo foi resolvido:
- ✅ IPs atualizados em todos os arquivos
- ✅ Porta 3003 (Express) e porta 80 (Next.js) sem conflito na mesma EC2
- ✅ MongoDB sem autenticação (`mongodb://3.84.153.49:27017/biodash`)
- ✅ JWT Secret igual nos dois projetos
- ✅ S3 via IAM Instance Role (sem Access Keys — compatível com conta estudante)
- ✅ Frontend consome o backend Express em `http://98.92.12.89:3003/api`

---

*Documento gerado automaticamente — Antigravity AI | BioDash Deploy Checkpoint*
