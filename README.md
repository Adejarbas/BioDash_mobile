
<div align="center">
  <img src="https://github.com/user-attachments/assets/4bc5211a-dc9c-48aa-b7f6-9e279f75a7ec" alt="BioGen Logo" width="200"/>

  
</div>



## Sistema de Gestão de Biodigestores

Monitore e otimize o desempenho do seu biodigestor com nosso dashboard completo e intuitivo.

---

## 📖 SOBRE O PROJETO

O projeto **BioGen** propõe uma solução sustentável para o tratamento de resíduos orgânicos provenientes principalmente de indústrias alimentícias, atividades agrícolas e pecuárias. A iniciativa busca transformar esses resíduos em biogás por meio de biodigestores, permitindo a geração de energia elétrica limpa e acessível. A energia produzida pode ser utilizada para abastecimento elétrico ou convertida em gás para uso doméstico. O processo também gera biofertilizantes, aproveitando integralmente os resíduos orgânicos e contribuindo para uma cadeia produtiva mais sustentável.


## Nossos Diferenciais

### 🔹 Rastreamento de Resíduos
Monitore a quantidade de resíduos processados pelo seu biodigestor em tempo real.

---

### 🔹 Geração de Energia
Acompanhe a energia produzida pelo seu sistema com análises detalhadas.

---

### 🔹 Benefícios Fiscais
Calcule e visualize os benefícios fiscais da sua produção de energia sustentável.

---


## 🎯 **Objetivos de Desenvolvimento Sustentável (ODS)**

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="https://github.com/user-attachments/assets/8a692e01-f884-44a9-9380-eb0d16579ac4" width="80"/>
        <br><strong>ODS 7</strong><br>Energia Limpa<br>e Acessível
       </td>
      </td>
      <td align="center">
        <img src="https://github.com/user-attachments/assets/0633144f-a4f3-4999-afae-7dd55b6cdb6c" width="80"/>
        <br><strong>ODS 10</strong><br>Redução das<br>Desigualdades
      </td>
      <td align="center">
        <img src="https://github.com/user-attachments/assets/8ae4f5c8-9207-43a1-9b28-eb3ca05ec3ec" width="80"/>
        <br><strong>ODS 12</strong><br>Consumo e Produção<br>Responsáveis
      </td>
      <td align="center">
        <img src="https://github.com/user-attachments/assets/059aeb4f-61ff-42f6-9e2e-8b93e2fecc8d" width="80"/>
        <br><strong>ODS 13</strong><br>Ação contra a<br>Mudança do Clima
      </td>
   </tr>
  </table>
</div>



## 🔗 PROTÓTIPO E DOCUMENTAÇÃO


- http://biodash.duckdns.org/

- http://biodash-api.duckdns.org/

- https://drive.google.com/file/d/1cBaFjSCvvmQXrrmZGH64rAcDUtQxmx86/view


## 🔹 Requisitos Funcionais 


| Nº do requisito | Nome                         | Descrição |
|-----------------|------------------------------|-----------|
| RF001 | Cadastro da Empresa | O sistema tem que ser capaz de registrar e guardar dados obrigatórios como informações de login, informações empresariais e de endereço da empresa. |
| RF002 | Validação CNPJ | O sistema deve validar o CNPJ, garantindo que os dados sejam reais por meio de consulta a uma API ou verificação de estrutura. |
| RF003 | Validação CEP | O sistema deve validar o CEP, garantindo que os dados sejam reais por meio de consulta a uma API ou verificação de estrutura. |
| RF004 | Login | O sistema deve permitir que as empresas acessem suas contas por meio de autenticação com e-mail e senha, verificando as credenciais e redirecionando para o ambiente correspondente. |
| RF005 | Visualização dos dados | O sistema deve disponibilizar um Dashboard e área com todas as informações volumétricas e de desempenho do sensor. |
| RF006 | Exportação de dados | O sistema deve permitir a geração de relatórios em três formatos: PDF (com gráficos e análises), Excel (planilha interativa) e CSV (dados brutos). |
| RF007 | Edição de dados do perfil | O sistema deve permitir a atualização de informações pessoais e configurações da conta. |
| RF008 | Armazenamento local | Permitir que o usuário altere os indicadores diretamente na própria página, garantindo que as modificações sejam salvas automaticamente no armazenamento local do dispositivo, preservando as configurações mesmo após atualização ou novo acesso ao sistema. |




## 🔹 Requisitos Não Funcionais 

| Nº do requisito | Nome | Descrição |
|-----------------|------|-----------|
| RNF001 | Linguagem | Utilização de TypeScript e JavaScript, garantindo consistência e tipagem estática entre frontend e backend. |
| RNF002 | Segurança | Proteção de dados por meio de tokens JWT, sanitização de inputs, criptografia de dados em trânsito (SSL/TLS obrigatório) e em repouso, em conformidade com a LGPD. |
| RNF003 | Banco de Dados | Persistência híbrida: PostgreSQL (Azure Database for PostgreSQL Flexible Server) para dados relacionais e MongoDB/Cosmos DB para marcadores geoespaciais. |
| RNF004 | Interface | Interface com layout responsivo para smartphones e suporte multiplataforma (Web e Mobile). |
| RNF005 | Framework | React Native com Expo no frontend e Next.js / Node.js no backend core. |
| RNF006 | Desempenho | Tempo de resposta abaixo de 150 ms para réplicas aquecidas e tratamento otimizado de cold start (4-7s) na camada serverless. |
| RNF007 | Hospedagem em Nuvem | Infraestrutura moderna provisionada integralmente na nuvem pública Microsoft Azure. |
| RNF008 | Provedor de Nuvem | Microsoft Azure (ecossistema migrado da AWS visando desacoplamento, portabilidade e governança FinOps). |
| RNF009 | Segurança na Nuvem | Autenticação Passwordless via OpenID Connect (OIDC) com Microsoft Entra ID e User-Assigned Managed Identity, eliminando credenciais estáticas de longa duração. |
| RNF010 | Escalabilidade | Azure Container Apps (ACA) orquestrado com KEDA com escalonamento a zero (`minReplicas: 0`) para garantia de custo zero sob a assinatura *Azure for Students*. |
| RNF011 | Armazenamento de Arquivos | Azure Blob Storage acessado estritamente via padrão Ports & Adapters (`IFileStoragePort` e `AzureBlobStorageAdapter`) com SAS Tokens temporários. |
| RNF012 | Conteinerização & Registry | Aplicação conteinerizada com Docker e imagens publicadas no Docker Hub / GitHub Container Registry (vedado o uso de ACR para evitar cobranças fixas). |
| RNF013 | Observabilidade | Telemetria aberta e vendor-neutral baseada em OpenTelemetry (OTel), com ingestão unificada no Azure Monitor e Application Insights (eliminando CloudWatch e X-Ray). |
| RNF014 | Acessibilidade | Conformidade com as diretrizes do W3C para usabilidade e contraste adequado. |

## 🛠️ TECNOLOGIAS UTILIZADAS

<p align="left">
  <img src="https://img.shields.io/badge/Microsoft_Azure-0078D4?style=for-the-badge&logo=microsoft-azure&logoColor=white" alt="Azure"/>
  <img src="https://img.shields.io/badge/Bicep-0078D4?style=for-the-badge&logo=azure-pipelines&logoColor=white" alt="Bicep IaC"/>
  <img src="https://img.shields.io/badge/OpenTelemetry-000000?style=for-the-badge&logo=opentelemetry&logoColor=white" alt="OpenTelemetry"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native"/>
  <img src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo"/>
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Python_FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/Docker_Hub-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Hub"/>
  <img src="https://img.shields.io/badge/GitHub_Actions_OIDC-2088FF?style=for-the-badge&logo=github-actions&logoColor=white" alt="GitHub Actions"/>
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/AWS_(Legada)-232F3E?style=for-the-badge&logo=amazonaws&logoColor=white" alt="AWS Legada"/>
</p>

## ☁️ Arquitetura e Transição de Nuvem (AWS ➔ Microsoft Azure)

A arquitetura do **BioDash** evoluiu de uma infraestrutura monolítica legada hospedada em máquinas virtuais na AWS para uma arquitetura distribuída moderna, serverless e desacoplada na **Microsoft Azure**.

### 📊 Diagrama Arquitetural: Antes (AWS) vs. Depois (Azure)

```mermaid
graph LR
    subgraph AWS_Legada["1. Arquitetura Original (AWS EC2 / Acoplada)"]
        AWS_Clients["Mobile & Web Clients"] -->|HTTP 80| AWS_EC2_Front["EC2 Frontend (Nginx)"]
        AWS_Clients -->|HTTP 3003| AWS_EC2_Back["EC2 Backend (Express)"]
        AWS_EC2_Back -->|SQL 5432| AWS_RDS["RDS PostgreSQL"]
        AWS_EC2_Back -->|TCP 27017| AWS_Mongo["EC2 MongoDB Host"]
        AWS_EC2_Back -->|SDK Proprietário| AWS_S3["Amazon S3 (biogen-s3)"]
        AWS_DevOps["DevOps"] -->|SSH Key Estática| AWS_EC2_Back
    end

    subgraph Transicao_6Rs["2. Transição Arquitetural (6 R's)"]
        T1["Refactor: Ports & Adapters Storage"]
        T2["Replatform: VMs ➔ Azure Container Apps"]
        T3["Replatform: RDS ➔ PostgreSQL Flexible B1ms"]
        T4["Refactor: SSH ➔ OIDC Passwordless"]
        T5["Refactor: CloudWatch ➔ OpenTelemetry"]
        T6["FinOps: Docker Hub (Sem custos de ACR)"]
    end

    subgraph Azure_Alvo["3. Arquitetura Alvo (Microsoft Azure Serverless)"]
        Az_Clients["Mobile & Web Clients"] -->|HTTPS Ingress| ACA_Web["ACA Frontend (Expo Web)"]
        Az_Clients -->|HTTPS REST| ACA_API["ACA Backend (Next.js)"]
        Az_Clients -->|SAS Token Direct PUT| Az_Blob["Azure Blob (biogen-avatars)"]
        ACA_API -->|VNet SSL| Az_PG["PostgreSQL Flexible Server"]
        ACA_API -->|OTel Traces & Logs| Az_AppInsights["Application Insights"]
        GH_Actions["GitHub Actions OIDC"] -->|Zero Secrets Deploy| ACA_API
    end

    AWS_Legada ==> Transicao_6Rs ==> Azure_Alvo
```

## ⚙️ **API Endpoints**

### 📍Mapas e Marcadores (Geolocalização - MongoDB):
- **GET /api/markers** - Retorna a lista de todos os marcadores cadastrados.
- **POST /api/markers** - Cria um novo marcador ou o atualiza 
- **DELETE /api/markers/:id** - Remove um marcador através do seu ID.

### 🔐 Autenticação (/api/auth)
Gerencia o login e dados de acesso. Exceto o registro e login, os demais endpoints exigem Token JWT (via authMiddleware).

- **POST /api/auth/register** - Registra um novo usuário no sistema
- **POST /api/auth/login** - Realiza a autenticação do usuário a partir de email e senha, enviando o token JWT.
- **GET /api/auth/me (Requer autenticação)** - Busca os dados resumidos do perfil que está atualmente logado.
- **PUT /api/auth/password (Requer autenticação)** - Permite atualizar a senha do usuário atual.

### 👤 Perfil do Usuário (/api/profile) 

Gerencia os dados e informações da conta cadastrada.
- **GET /api/profile (Requer autenticação)** - Busca todos os dados pessoais ou empresariais cadastrados no perfil do usuário
- **PUT /api/profile (Requer autenticação)** - Atualiza (ou insere) informações no perfil
  
### 📊 Indicadores do Biodigestor (/api/indicators)
Responsável pelas métricas visualizadas no dashboard relacionadas ao processamento, geração de energia e economia.

- **GET /api/indicators (Requer autenticação)** - Retorna todo o histórico de indicadores 
- **POST /api/indicators (Requer autenticação)** - Cria ou atualiza as métricas de um mês e ano específicos (upsert).

### 🔧 Manutenções e Incidentes (/api/maintenance)
Agendamento e gerenciamento de manutenções no equipamento, bem como os registros de incidentes técnicos. Agendamentos:

- **GET /api/maintenance/schedules (Requer autenticação)** - Busca o histórico listando os 5 agendamentos de manutenção mais recentes do usuário.
- **POST /api/maintenance/schedules (Requer autenticação)** - Registra uma nova programação de manutenção 
- **PUT /api/maintenance/schedules/:id (Requer autenticação)** - Permite atualizar o status do agendamento 
- **DELETE /api/maintenance/schedules/:id (Requer autenticação)** - Exclui uma programação de manutenção do histórico.

### 🔈Incidentes Ativos:

- **GET /api/maintenance/incidents (Requer autenticação)** - Procura e retorna o cenário de incidente/anomalia mais recente registrado 
- **PUT /api/maintenance/incidents/active (Requer autenticação)** - Marca o incidente mais recente como resolvido

### ⚠️ Alertas de Sensores (/api/alerts)
Exibição e cadastro dos alertas emitidos automaticamente quando surgem anomalias na máquina.

- **GET /api/alerts (Requer autenticação)** - Retorna as 50 notificações/alertas emitidos mais recentes
- **POST /api/alerts (Requer autenticação)** - Cria um novo registro de emissão de alerta associado ao usuário

## 📦 *Instalação e Configuração Local*

Esta seção descreve os passos para configurar e executar localmente os projetos do ecossistema **BioDash**, além de instruções para orquestração simplificada via **Docker Compose**.

---

### 📋 Pré-requisitos

* **Node.js:** versão 20.x LTS ou superior
* **npm:** versão 10.x ou superior
* **Python:** versão 3.11 ou 3.12 (para o serviço de IA)
* **Docker & Docker Compose:** para execução em contêineres
* **Expo Go:** aplicativo móvel (Android/iOS) para testes em dispositivo físico
* **Azure CLI:** versão 2.55+ (para comandos e deploy na nuvem)

---

### 📱 Passo 1: Frontend Mobile & Web (`BioDash_mobile`)

O frontend é desenvolvido em **React Native** com **Expo** e suporta Web, Android e iOS.

1. Clone o repositório e acesse o diretório:
   ```bash
   git clone https://github.com/Adejarbas/BioDash_mobile.git
   cd BioDash_mobile
   ```

2. Crie o arquivo `.env` a partir de `.env-exemple`:
   ```bash
   cp .env-exemple .env
   # No Windows PowerShell: copy .env-exemple .env
   ```

3. Configure os endpoints públicos no `.env`:
   ```env
   # Endpoint do Backend API
   EXPO_PUBLIC_API_URL=http://localhost:3003/api

   # Supabase Público (Autenticação)
   EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_publica
   ```

4. Instale as dependências:
   ```bash
   npm install
   ```

5. Execute na plataforma desejada:
   * **Web:** `npm run web` (acessível em `http://localhost:8081`).
   * **Dispositivo Físico:** `npm run start` (abra o aplicativo **Expo Go** e escaneie o QR Code).
   * **Android:** pressione `a` no terminal (requer emulador configurado).
   * **iOS:** pressione `i` no terminal (requer macOS e Xcode).

---

### ⚙️ Passo 2: Backend API Core (`BioDashBD`)

O backend oficial opera em Next.js (Node.js/TypeScript) com rotas REST sob `/api`, suporte a OpenTelemetry e padrão Ports & Adapters para Azure Blob Storage:

1. Clone o repositório e acesse o diretório:
   ```bash
   git clone https://github.com/Adejarbas/BioDashBD.git
   cd BioDashBD
   ```

2. Crie o arquivo `.env` a partir do modelo `.env.example`:
   ```bash
   cp .env.example .env
   # No Windows PowerShell: copy .env.example .env
   ```

3. Configure as variáveis necessárias no `.env`:
   ```env
   NODE_ENV=development
   PORT=3003
   API_BASE_URL=http://localhost:3003
   FRONTEND_URL=http://localhost:80

   # Persistência Relacional (PostgreSQL Local ou Azure Flexible Server)
   POSTGRES_URL=postgresql://usuario:senha@localhost:5432/biodash?sslmode=disable

   # Azure Blob Storage (Ports & Adapters)
   AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=stbiodashprod;AccountKey=sua_chave==;EndpointSuffix=core.windows.net
   AZURE_STORAGE_CONTAINER_NAME=biogen-avatars
   STORAGE_PROVIDER=azure

   # Autenticação e Serviços Auxiliares
   JWT_SECRET=coloque_uma_chave_segura_de_ao_menos_32_caracteres
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
   AI_SERVICE_URL=http://localhost:5000
   ```

4. Instale as dependências e inicie o servidor de desenvolvimento:
   ```bash
   npm install
   npm run dev
   ```
   *A API estará acessível em `http://localhost:3003`.*

---

### 🤖 Passo 3: Microsserviço de Inteligência Artificial (`BioDash_ai-service`)

O microsserviço de PLN, transcrição de áudio via Whisper e Chatbot opera com FastAPI.

1. Clone o repositório e acesse o diretório:
   ```bash
   git clone https://github.com/MathGueff/BioDash_ai-service.git
   cd BioDash_ai-service
   ```

2. Crie o arquivo `.env` a partir de `.env.example`:
   ```bash
   cp .env.example .env
   # No Windows PowerShell: copy .env.example .env
   ```

3. Inicie a aplicação via NPM (utiliza `uv` + Python 3.11 automaticamente configurados no `package.json`):
   ```bash
   npm run dev
   ```
   *A documentação Swagger estará disponível em `http://localhost:5000/docs`.*

---

### 🐳 Passo 4: Executando os Serviços com Docker Compose

Cada componente do ecossistema possui sua própria definição de `docker-compose.yml` para execução conteinerizada rápida:

#### 1. Frontend Web (`BioDash_mobile`)
```bash
git clone https://github.com/Adejarbas/BioDash_mobile.git
cd BioDash_mobile
docker compose up -d
```
* **Aplicação Web (Nginx):** `http://localhost:80`

#### 2. Backend API Core (`BioDashBD`)
```bash
git clone https://github.com/Adejarbas/BioDashBD.git
cd BioDashBD
cp .env.example .env
docker compose up -d
```
* **API REST (Next.js):** `http://localhost:3003`

#### 3. Microsserviço de IA (`BioDash_ai-service`)
```bash
git clone https://github.com/MathGueff/BioDash_ai-service.git
cd BioDash_ai-service
cp .env.example .env
docker compose up -d
# ou via NPM: npm run docker:up
```
* **API FastAPI / Swagger UI:** `http://localhost:5000/docs`

---

## ☁️ Migração para Microsoft Azure & Infraestrutura como Código (Bicep)

Em atendimento às diretrizes do projeto ([migracao_aws_para_azure.md](./docs/tasks/migra_o_aws_para_azure.md)), a infraestrutura do ecossistema **BioDash** foi integralmente migrada da Amazon Web Services para a **Microsoft Azure**. 

A transição foi orientada a **Infraestrutura como Código declarativa (Bicep)**, **arquitetura serverless com escala a zero**, **esteira CI/CD sem senhas (OIDC Passwordless)** e **governança FinOps de custo zero** sob a assinatura acadêmica *Azure for Students*.

### 📚 Central de Documentação Técnica (`docs/azure-migration/`)

O repositório reúne um acervo documental completo para auditoria e avaliação da banca acadêmica:

| Documento | Nome do Relatório | Finalidade Principal | Checklist Vinculado |
| :--- | :--- | :--- | :--- |
| [**`0_migration_report.md`**](./docs/azure-migration/0_migration_report.md) | **Diagnóstico Arquitetural & Lock-in** | Auditoria de serviços AWS, matriz de acoplamento, framework dos 6 R's e Ports & Adapters. | Seções 3.1, 3.2 |
| [**`1_guideline.md`**](./docs/azure-migration/1_guideline.md) | **Guia Operacional Passo a Passo** | Roteiro de setup local, dicionário de variáveis de ambiente e guia de deploy detalhado. | Seções 3.3, 3.5, 3.10, 8.2 |
| [**`2_iac_architecture.md`**](./docs/azure-migration/2_iac_architecture.md) | **Arquitetura IaC (Azure Bicep)** | Especificação de módulos Bicep, topologia de rede VNet/NSG, Container Apps e OIDC Entra ID. | Seções 3.4, 3.5, 3.6, 3.9, 3.10 |
| [**`3_tecnical_documentation.md`**](./docs/azure-migration/3_tecnical_documentation.md) | **Desafios Técnicos, Telemetria & FinOps** | Mitigação de cold start, OpenTelemetry com KQL, análise FinOps e descomissionamento AWS. | Seções 3.8, 3.11, 3.12, 8.3 |
| [**`diagrams_index.md`**](./docs/azure-migration/diagrams_index.md) | **Catálogo de Diagramas de Arquitetura** | Índice unificado de diagramas vetoriais editáveis (`.drawio`) e renderizáveis (Mermaid). | Seções 8.2, 7 |

---

### 🚀 Guia de Execução do Deploy no Azure

#### Opção A: Deploy Contínuo Automatizado via GitHub Actions (Recomendado)

O provisionamento é disparado automaticamente através do workflow [`.github/workflows/infra-deploy.yml`](./.github/workflows/infra-deploy.yml) ao realizar push para a branch `main`:

1. **Job 1 (validate):** Executa linting sintático via `az bicep build` e análise de impacto prévio via `az deployment group what-if`.
2. **Job 2 (deploy):** Autentica via **OpenID Connect (OIDC)** com o Microsoft Entra ID (sem segredos estáticos) e executa o provisionamento incremental via `azure/arm-deploy@v2`.
3. Os endpoints públicos gerados para a API e Web são disponibilizados no **GitHub Step Summary**.

#### Opção B: Deploy Manual via Azure CLI

Para provisionar os recursos diretamente via terminal local:

```bash
# 1. Autenticar na console da Azure
az login

# 2. Definir a assinatura acadêmica ativa
az account set --subscription "SEU_SUBSCRIPTION_ID"

# 3. Criar o Resource Group na região chilecentral
az group create --name rg-biodash-prod --location chilecentral

# 4. Validar o template Bicep
az deployment group validate \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json \
  --parameters postgresAdminPassword="SuaSenhaSeguraPostgres123!"

# 5. Executar o provisionamento incremental
az deployment group create \
  --name deploy-biodash-prod \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json \
  --parameters postgresAdminPassword="SuaSenhaSeguraPostgres123!"
```

---
### 🏆 Alinhamento com a Rúbrica de Avaliação

| Dimensão Avaliada | Critério de Excelência (2,0 pts) | Evidência Comprobatória |
| :--- | :--- | :--- |
| **1. Desacoplamento** | Domínio isolado; padrão Ports & Adapters; zero SDK proprietário no core. | [`0_migration_report.md`](./docs/azure-migration/0_migration_report.md) & [`purge-aws-residuals.DECISION.MD`](./docs/decisions/purge-aws-residuals.DECISION.MD) |
| **2. Governança / FinOps** | Custo zero absoluto; exclusão de ACR e AKS; serviços gratuitos bem dimensionados. | [`3_tecnical_documentation.md`](./docs/azure-migration/3_tecnical_documentation.md) (Seção 4) |
| **3. Observabilidade** | Full OpenTelemetry; logs estruturados e distributed tracing no Azure Monitor. | [`3_tecnical_documentation.md`](./docs/azure-migration/3_tecnical_documentation.md) (Seção 2) |
| **4. IaC e Automação** | Infra 100% via Bicep declarativo; CI/CD Passwordless via OIDC; deploy contínuo. | [`2_iac_architecture.md`](./docs/azure-migration/2_iac_architecture.md) & [`.github/workflows/infra-deploy.yml`](./.github/workflows/infra-deploy.yml) |
| **5. Execução Técnica** | Migração limpa; cold start mitigado; corte seguro e documentado da AWS. | [`1_guideline.md`](./docs/azure-migration/1_guideline.md) & [`3_tecnical_documentation.md`](./docs/azure-migration/3_tecnical_documentation.md) (Seção 5) |

---

## 👥 EQUIPE

<table>
  <thead>
    <tr>
      <th>Nome</th>
      <th>GitHub</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alessandro Rodrigues</td>
      <td>
       <a href="https://github.com/alerodriguesm02" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Alessandro Rodrigues">
        </a>
      </td>
    </tr>
    <tr>
      <td>Daniel Adejarbas</td>
      <td>
        <a href="https://github.com/Adejarbas" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Daniel Adejarbas">
        </a>
      </td>
    </tr>
    <tr>
      <td>Guilherme Piva</td>
      <td>
        <a href="https://github.com/guipiva" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Mayara Barros">
        </a>
      </td>
    </tr>
    <tr>
      <td>Matheus Gueff</td>
      <td>
      <a href="https://github.com/MathGueff" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Matheus Gueff">
        </a>
      </td>
    </tr>
    <tr>
      <td>Mayara Barros</td>
      <td>
      <a href="https://github.com/Mayarasb" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Mayara Barros">
        </a>
      </td>
    </tr>
    <tr>
      <td>Thiago Muniz</td>
      <td>
        <a href="https://github.com/Thmn93" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub thiago Muniz">
        </a>
      </td>
    </tr>
    <tr>
      <td>Vanessa Capuano</td>
      <td>
        <a href="https://github.com/Vanessa-Nobrega" target="_blank">
          <img src="https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Vanessa Capuano">
        </a>
      </td>
    </tr>
  </tbody>
</table>

## Rodapé

©️ 2026 BioDash. Todos os direitos reservados.
