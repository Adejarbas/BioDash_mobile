# Guia Operacional Passo a Passo e Configurações

---

## 🧭 1. Visão Geral do Ecossistema

O ecossistema **BioDash** opera em uma topologia desacoplada composta por três repositórios complementares. A documentação e os templates de infraestrutura estão centralizados no repositório mobile:

```
c:\Projetos\Fatec\BioGen\
├── BioDashBD/            ➔ Backend API (Next.js App Router / TypeScript)
├── BioDash_mobile/       ➔ Frontend Mobile & Web (Expo / React Native / IaC Bicep)
└── BioDash_ai-service/   ➔ Microsserviço de Inteligência Artificial (FastAPI / Whisper / LLM)
```

Este guia reúne todas as instruções operacionais para:
1. Configurar e rodar os três projetos **localmente em ambiente de desenvolvimento**.
2. Compreender a **matriz exata de variáveis de ambiente** de cada repositório.
3. Executar o **deploy automatizado na Microsoft Azure** via Infraestrutura como Código (Bicep) e esteira de CI/CD (GitHub Actions com OIDC Passwordless).

---

## 🔑 2. Matriz de Variáveis de Ambiente por Repositório

### 2.1. Visão Sinóptica de Responsabilidades

| Variável / Domínio | `BioDashBD` (Backend) | `BioDash_mobile` (Frontend) | `BioDash_ai-service` (IA) | Observações de Segurança & FinOps |
| :--- | :---: | :---: | :---: | :--- |
| **Credenciais Azure Storage** | **Sim** | ❌ Não | ❌ Não | Chaves da Storage Account nunca chegam ao cliente; o backend gera SAS Tokens efêmeros. |
| **Conexão PostgreSQL** | **Sim** | ❌ Não | ❌ Não | O frontend consome a API REST; não acessa o banco relacional diretamente. |
| **URL da API Backend** | Origem CORS | **Sim** (`EXPO_PUBLIC_API_URL`) | ❌ Não | Unificada no mobile para evitar divergências entre mobile e web. |
| **Supabase (Auth/Fallback)** | **Sim** (Service Role) | **Sim** (Anon Key) | **Sim** (Service Role) | Cada serviço usa seu nível de privilégio estrito. |
| **OpenTelemetry (App Insights)**| **Sim** | ❌ Não | Opcional | Centralizado no backend para rastreamento de requisições HTTP e banco. |

---

### 2.2. Repositório `BioDashBD` (Backend API Next.js)

Arquivo de configuração: `.env` (baseado em `.env.example`).

```env
# ==========================================
# BIODASHBD - BACKEND NEXT.JS (.env)
# ==========================================

# --- Servidor e Ambiente ---
NODE_ENV=development
PORT=3003
API_BASE_URL=http://localhost:3003
FRONTEND_URL=http://localhost:80

# --- Autenticação JWT ---
JWT_SECRET=coloque_uma_chave_segura_de_ao_menos_32_caracteres

# --- Persistência Relacional (PostgreSQL) ---
# Em desenvolvimento local:
POSTGRES_URL=postgresql://usuario:senha@localhost:5432/biodash?sslmode=disable
# Em produção no Azure (PostgreSQL Flexible Server B1ms):
# POSTGRES_URL=postgresql://biodashadmin:SuaSenha@psql-biodash-prod.postgres.database.azure.com:5432/biodash?sslmode=require

# --- Azure Blob Storage (Ports & Adapters) ---
# Opção A (Recomendada): Connection String completa
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=stbiodashprod;AccountKey=sua_chave==;EndpointSuffix=core.windows.net
# Opção B (Alternativa): Nome da conta + Chave de Acesso
AZURE_STORAGE_ACCOUNT_NAME=stbiodashprod
AZURE_STORAGE_ACCOUNT_KEY=sua_chave==
AZURE_STORAGE_CONTAINER_NAME=biogen-avatars
STORAGE_PROVIDER=azure

# --- Provedores Auxiliares e Microsserviços ---
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anonima
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
AI_SERVICE_URL=http://localhost:5000

# --- Observabilidade OpenTelemetry ---
# Obtida no recurso Application Insights do Azure:
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...;IngestionEndpoint=https://...
```

---

### 2.3. Repositório `BioDash_mobile` (Frontend Expo / React Native)

Arquivo de configuração: `.env` (baseado em `.env-exemple`).

> [!IMPORTANT]
> **Zero Segredos no Mobile:** O frontend não recebe nenhuma chave da Azure, AWS ou credencial de banco de dados. Todas as variáveis expostas começam com o prefixo obrigatório `EXPO_PUBLIC_`.

```env
# ==========================================
# BIODASH_MOBILE - FRONTEND EXPO (.env)
# ==========================================

# --- Endpoint do Backend API ---
# Opção 1: Desenvolvimento Web no navegador:
EXPO_PUBLIC_API_URL=http://localhost:3003/api

# Opção 2: Dispositivo Físico / Expo Go (mesmo Wi-Fi - troque pelo IP da máquina host):
# EXPO_PUBLIC_API_URL=http://192.168.1.100:3003/api

# Opção 3: Produção (Azure Container Apps):
# EXPO_PUBLIC_API_URL=https://ca-biodash-api-prod.<fqdn-regiao>.azurecontainerapps.io/api

# --- Autenticação Supabase ---
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_publica
```

---

### 2.4. Repositório `BioDash_ai-service` (Microsserviço de IA FastAPI)

Arquivo de configuração: `.env` (baseado em `.env.example`).

```env
# ==========================================
# BIODASH_AI-SERVICE - FASTAPI (.env)
# ==========================================

AI_SERVICE_PORT=5000

# Supabase (Acesso ao contexto de dados de biodigestores)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# Configurações do Faster-Whisper (Transcrição de Áudio de Sensores e Chamados)
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
MAX_AUDIO_BYTES=20971520
```

---

### 2.5. Segredos e Variáveis no GitHub Actions (`BioDash_mobile`)

Para a esteira de CI/CD via **OpenID Connect (OIDC)** e provisionamento Bicep, os seguintes segredos devem ser configurados em **Settings > Secrets and variables > Actions**:

| Nome do Segredo / Variável | Tipo | Finalidade |
| :--- | :--- | :--- |
| `AZURE_CLIENT_ID` | Secret | Application (client) ID do App Registration no Microsoft Entra ID. |
| `AZURE_TENANT_ID` | Secret | Directory (tenant) ID da conta Azure. |
| `AZURE_SUBSCRIPTION_ID` | Secret | ID da Assinatura ativa (*Azure for Students*). |
| `AZURE_RESOURCE_GROUP_NAME`| Variable | Nome do Resource Group (ex: `rg-biodash-prod`). |
| `PG_ADMIN_PASSWORD` | Secret | Senha mestra a ser provisionada no PostgreSQL Flexible Server. |
| `DOCKERHUB_USERNAME` | Secret | Usuário do Docker Hub para publicação de imagens gratuitas. |
| `DOCKERHUB_TOKEN` | Secret | Access Token com permissão de escrita no Docker Hub. |

---

## 💻 3. Configurações para Executar os Projetos Localmente

### 3.1. Pré-Requisitos do Ambiente de Desenvolvimento
- **Node.js:** versão 20.x LTS ou superior.
- **Python:** versão 3.11 ou 3.12 (recomendado gerenciador `uv` ou `venv`).
- **Docker Desktop:** com suporte a WSL2 ou Hyper-V ativo.
- **Azure CLI:** versão 2.55+ instalada (`az --version`).
- **Git:** instalado e configurado.

---

### 3.2. Executando o Backend (`BioDashBD`)

1. Navegue até o diretório do backend:
   ```bash
   cd c:\Projetos\Fatec\BioGen\BioDashBD
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie o arquivo `.env` a partir do modelo:
   ```bash
   cp .env.example .env
   ```

4. Preencha os valores de `POSTGRES_URL` e `AZURE_STORAGE_CONNECTION_STRING` (ou utilize credenciais de teste).

5. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   *A API estará acessível em `http://localhost:3003` com rotas ativas sob `/api`.*

---

### 3.3. Executando o Frontend Mobile & Web (`BioDash_mobile`)

1. Navegue até o diretório do frontend:
   ```bash
   cd c:\Projetos\Fatec\BioGen\BioDash_mobile
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie o arquivo `.env` a partir do modelo:
   ```bash
   cp .env-exemple .env
   ```

4. **Para rodar no Navegador (Web):**
   ```bash
   npm run web
   # ou: npx expo start --web
   ```
   *A aplicação Web abrirá em `http://localhost:8081`.*

5. **Para rodar no Dispositivo Móvel (Android/iOS via Expo Go):**
   - Garanta que `EXPO_PUBLIC_API_URL` contenha o IP local da sua máquina (ex: `http://192.168.1.100:3003/api`).
   - Execute:
     ```bash
     npx expo start
     ```
   - Escaneie o QR Code com o aplicativo **Expo Go** no smartphone.

---

### 3.4. Executando o Microsserviço de IA (`BioDash_ai-service`)

1. Navegue até o diretório do serviço de IA:
   ```bash
   cd c:\Projetos\Fatec\BioGen\BioDash_ai-service
   ```

2. Crie e ative um ambiente virtual:
   ```bash
   # Windows PowerShell:
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

3. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```

4. Copie o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```

5. Inicie a API FastAPI:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 5000 --reload
   ```
   *A documentação interativa Swagger estará disponível em `http://localhost:5000/docs`.*

---

### 3.5. Orquestração Local com Docker Compose

Para rodar todo o ecossistema localmente via contêineres de forma integrada:

```bash
# Na pasta BioDash_mobile:
docker compose up -d
```

---

## 🚀 4. Guia de Execução do Deploy na Microsoft Azure

### 4.1. Passo 1: Publicação das Imagens no Docker Hub (Sem Custos de ACR)

> [!WARNING]
> **Regra FinOps:** É estritamente proibido criar instâncias de **Azure Container Registry (ACR)** na assinatura *Azure for Students*, pois geram tarifação diária fixa. Todas as imagens são compiladas e publicadas gratuitamente no **Docker Hub** ou **GitHub Container Registry (GHCR)**.

Comandos para build e envio manual (caso não utilize a action automatizada):

```bash
# 1. Backend API
cd c:\Projetos\Fatec\BioGen\BioDashBD
docker build -t adejarbas/biodash-api:latest .
docker push adejarbas/biodash-api:latest

# 2. Frontend Web
cd c:\Projetos\Fatec\BioGen\BioDash_mobile
docker build -f Dockerfile -t adejarbas/biodash-frontend:latest .
docker push adejarbas/biodash-frontend:latest

# 3. Microsserviço de IA
cd c:\Projetos\Fatec\BioGen\BioDash_ai-service
docker build -t mathgueff/biodash_ai-service:latest .
docker push mathgueff/biodash_ai-service:latest
```

---

### 4.2. Passo 2: Configuração da Federação OIDC no Microsoft Entra ID

Para permitir que o GitHub Actions realize o deploy sem chaves estáticas permanentes, execute o script de automação OIDC disponível em `BioDash_mobile/infra/scripts/`:

```powershell
# No PowerShell autenticado no Azure CLI (az login):
cd c:\Projetos\Fatec\BioGen\BioDash_mobile\infra\scripts
.\setup-azure-oidc.ps1 -SubscriptionId "SEU_SUBSCRIPTION_ID" -ResourceGroupName "rg-biodash-prod" -GitHubRepo "Adejarbas/BioDash_mobile"
```

O script realiza autonomamente:
1. Criação do **App Registration** e do **Service Principal** no Entra ID.
2. Atribuição do papel RBAC **Contributor** no Resource Group.
3. Criação dos **Federated Identity Credentials** para as branches `main`, `feat/azure-integration` e para o evento de `pull_request`.
4. Exibição dos identificadores exatos a serem copiados para o GitHub Secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`).

---

### 4.3. Passo 3: Provisionamento da Infraestrutura com Azure Bicep

#### Opção A: Deploy Automático via GitHub Actions (Recomendado)
1. Faça o push das alterações para a branch `feat/azure-integration` ou `main`.
2. O workflow [`.github/workflows/infra-deploy.yml`](../../.github/workflows/infra-deploy.yml) será disparado:
   - **Job 1 (validate):** Executa `az bicep build`, validação sintática e prévia visual de impacto (`az deployment group what-if`).
   - **Job 2 (deploy):** Executa o provisionamento incremental via `azure/arm-deploy@v2` sem intervenção manual.
3. Ao término, os endpoints públicos gerados são disponibilizados no **GitHub Step Summary**.

#### Opção B: Deploy Manual via Azure CLI

Caso queira provisionar diretamente da sua máquina de desenvolvimento:

```bash
cd c:\Projetos\Fatec\BioGen\BioDash_mobile

# 1. Autenticar no Azure
az login

# 2. Definir a assinatura ativa
az account set --subscription "SEU_SUBSCRIPTION_ID"

# 3. Criar o Resource Group na região desejada (ex: chilecentral ou eastus2)
az group create --name rg-biodash-prod --location chilecentral

# 4. Validar o template Bicep
az deployment group validate \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json \
  --parameters postgresAdminPassword="SuaSenhaSeguraPostgres123!"

# 5. Executar o Deploy Incremental
az deployment group create \
  --name deploy-biodash-$(date +%s) \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json \
  --parameters postgresAdminPassword="SuaSenhaSeguraPostgres123!"
```

---

### 4.4. Recursos Provisionados no Azure

Ao finalizar o deploy, os seguintes recursos estarão ativos no Resource Group `rg-biodash-prod`:

| Recurso Azure | Nome do Recurso | Função no Ecossistema | Configuração FinOps |
| :--- | :--- | :--- | :--- |
| **Virtual Network** | `vnet-biodash-prod` | Isolamento de tráfego (10.0.0.0/16) | Gratuito |
| **Network Security Group** | `nsg-biodash-prod` | Regras de firewall e portas de serviço | Gratuito |
| **Container Apps Environment** | `cae-biodash-prod` | Ambiente serverless gerenciado | Camada gratuita |
| **Container App (API)** | `ca-biodash-api-prod` | Backend Next.js API Routes (porta 3003) | `minReplicas: 0` (Scale-to-Zero) |
| **Container App (Web)** | `ca-biodash-web-prod` | Frontend Expo Web via Nginx (porta 80) | `minReplicas: 0` (Scale-to-Zero) |
| **PostgreSQL Flexible** | `psql-biodash-prod` | Banco relacional oficial | `Standard_B1ms` (750h/mês gratuitas) |
| **Storage Account** | `stbiodashprod` | Container de imagens `biogen-avatars` | `Standard_LRS` (Hot) |
| **Log Analytics Workspace** | `log-biodash-prod` | Ingestão e agregação de logs | Gratuito até 5 GB/mês |
| **Application Insights** | `appi-biodash-prod` | Observabilidade e telemetria OpenTelemetry | Vinculado ao Log Analytics |
| **User Managed Identity** | `id-biodash-prod` | Identidade sem senha com RBAC no Blob | Gratuito |

---

## 🧪 5. Validação Pós-Deploy e Testes de Sanidade

Após a conclusão do deploy, execute os seguintes passos de verificação:

1. **Obter os FQDNs dos Container Apps:**
   ```bash
   az containerapp show -g rg-biodash-prod -n ca-biodash-api-prod --query "properties.configuration.ingress.fqdn" -o tsv
   az containerapp show -g rg-biodash-prod -n ca-biodash-web-prod --query "properties.configuration.ingress.fqdn" -o tsv
   ```

2. **Teste de Cold Start (Primeira Requisição):**
   - Faça uma chamada `curl` para a rota de health check do backend:
     ```bash
     curl -I https://<FQDN_DO_BACKEND>/api/health
     ```
   - O primeiro retorno levará entre **4 e 8 segundos** devido à inicialização a frio da imagem do Docker Hub.
   - Chamadas subsequentes responderão em **menos de 150 ms**.

3. **Teste do Upload de Imagem via SAS Token (Azure Blob):**
   - Acesse o aplicativo Web ou Mobile.
   - Faça o upload de uma foto de perfil em *Company Profile*.
   - Verifique que a imagem é enviada com o cabeçalho `x-ms-blob-type: BlockBlob` diretamente ao endpoint `https://stbiodashprod.blob.core.windows.net/biogen-avatars/...`.
   - Confirme que a imagem renderiza perfeitamente através de SAS Token gerado sob demanda.

4. **Verificação de Telemetria:**
   - Acesse o **Azure Portal > Application Insights (`appi-biodash-prod`) > Live Metrics**.
   - Navegue pela aplicação e confirme que as métricas de CPU, latência de requisição e dependências HTTP aparecem em tempo real.
