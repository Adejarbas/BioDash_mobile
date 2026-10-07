# Infraestrutura como Código (IaC) com Azure Bicep — BioDash

**Marco do Projeto:** Marco 3 (Provisionamento de Infraestrutura) & Marco 4 (Automação OIDC e CI/CD)  
**Responsável:** Cloud Azure & IaC Bicep  
**Assinatura Alvo:** Azure for Students (**Custo Operacional Zero / FinOps**)  
**Linguagem de IaC:** Microsoft Bicep (DSL moderna compilada em ARM Templates)

---

## 1. Visão Geral da Arquitetura de Infraestrutura

A infraestrutura do **BioDash** foi totalmente desenhada para operar na nuvem Microsoft Azure seguindo os princípios de **infraestrutura imutável**, **segurança passwordless** e **FinOps rigoroso (custo zero)**.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 AZURE RESOURCE GROUP                   │
                  │                   (rg-biodash-prod)                    │
                  └────────────────────────────────────────────────────────┘
                                               │
         ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
         ▼                  ▼                  ▼                  ▼                  ▼
┌─────────────────┐┌─────────────────┐┌─────────────────┐┌─────────────────┐┌─────────────────┐
│     NETWORK     ││    IDENTITY     ││   MONITORING    ││     STORAGE     ││ CONTAINER APPS  │
│  VNet + Subnets ││ Managed Identity││  Log Analytics  ││ Storage Account ││   Environment   │
│  NSG (Firewall) ││ (id-biodash-*)  ││   App Insights  ││ Container:      ││   ACA Backend   │
│                 ││                 ││  (Full OTel)    ││   'avatars'     ││   ACA Frontend  │
│                 ││                 ││                 ││  (CORS + SAS)   ││ (minReplicas: 0)│
└─────────────────┘└─────────────────┘└─────────────────┘└─────────────────┘└─────────────────┘
```

---

## 2. Estrutura Modular de Arquivos (/infra)

A pasta `/infra` segue a padronização oficial de engenharia de software e a rúbrica de avaliação:

```
/infra
├── main.bicep                  # Orquestrador mestre (Escopo: Resource Group)
├── subscription.bicep          # Orquestrador global (Escopo: Subscription - cria o RG)
├── main.parameters.json        # Arquivo de parâmetros para ambientes (prod/dev)
├── README.md                   # Este manual operacional
│
├── modules/                    # Módulos reutilizáveis e desacoplados
│   ├── network.bicep           # VNet (10.0.0.0/16), Subnets (snet-aca, snet-db) e NSG
│   ├── identity.bicep          # User-Assigned Managed Identity para workloads
│   ├── monitoring.bicep        # Log Analytics Workspace e Application Insights (OTel)
│   ├── storage.bicep           # Storage Account, container 'avatars', CORS e RBAC
│   ├── container-apps-env.bicep# Azure Container Apps Managed Environment
│   ├── container-apps.bicep    # ACA Backend (Express) e Frontend (Nginx), minReplicas: 0
│   └── database.bicep          # Azure Database for PostgreSQL Flexible Server (Burstable B1ms)
│
└── scripts/
    ├── setup-azure-oidc.ps1    # Script PowerShell para provisionar OIDC e Federação
    └── setup-azure-oidc.sh     # Script Bash (Linux/macOS/Cloud Shell) para OIDC
```

---

## 3. Conformidade FinOps & Custo Zero (Azure for Students)

| Recurso | Configuração FinOps | Justificativa Técnica de Custo Zero |
| :--- | :--- | :--- |
| **Azure Container Apps (ACA)** | `minReplicas: 0`<br>`maxReplicas: 1`<br>`0.25 vCPU / 0.5 GiB` | **Escala a Zero:** Quando ocioso, nenhum contêiner consome vCPU ou memória. A cota gratuita da Azure oferece 180.000 vCPU-segundos, 360.000 GiB-segundos e 2 milhões de requisições mensais gratuitas. |
| **Container Registry** | **Docker Hub / GHCR** | ❌ **ACR é estritamente proibido** no Azure for Students (consumo acelerado de créditos). Imagens públicas são puxadas diretamente do Docker Hub sem custo de registro. |
| **Blob Storage** | `Standard_LRS`<br>Tier `Hot` | Menor tier de redundância local, com custo de fração de centavos por GB, coberto integralmente pela assinatura estudantil. |
| **Log Analytics & App Insights** | Retenção: 30 dias<br>Daily Cap: 1 GB | O Azure Monitor oferece 5 GB de ingestão mensal gratuita. O teto diário garante que logs excessivos não gerem cobrança. |
| **PostgreSQL Flexible** (Opcional) | `Standard_B1ms`<br>Storage: 32 GB | Coberto pelas até 750 horas gratuitas mensais na camada Burstable no primeiro ano. |

---

## 4. O Adapter de Blob e o Container `avatars`

O módulo `modules/storage.bicep` atende integralmente ao requisito de desacoplamento do Amazon S3:
1. **Container `avatars`:** Criado explicitamente para armazenar as fotos de perfil e biodigestores.
2. **Container `documents`:** Reservado para laudos e documentações de compliance.
3. **Regras de CORS:** Configurações de CORS habilitadas com verbos `GET, POST, PUT, DELETE, OPTIONS` para que o aplicativo mobile e frontend web possam enviar fotos diretamente usando URLs assinadas (**Shared Access Signature - SAS Token**).
4. **RBAC Passwordless:** A Managed Identity (`id-biodash-*`) recebe automaticamente o papel de **Storage Blob Data Contributor** no escopo da Storage Account.

---

## 5. Autenticação OIDC (OpenID Connect) — Marco 4

Em conformidade com as diretrizes modernas de DevOps ("*Zero senhas. Zero secrets. Segurança moderna*"):
- O GitHub Actions autentica no Azure via **tokens JWT efêmeros emitidos pelo GitHub**, validados pelo Microsoft Entra ID através de **Credenciais Federadas**.
- Nenhuma chave secreta com prazo de validade (`client-secret`) é armazenada no GitHub.

### Como Executar a Configuração OIDC:

```powershell
# No PowerShell (com Azure CLI instalada):
az login
.\infra\scripts\setup-azure-oidc.ps1 -GitHubOrg "Adejarbas" -GitHubRepo "BioDash_mobile" -ResourceGroupName "rg-biodash-prod"
```

Ou no Linux/macOS/Cloud Shell:
```bash
az login
chmod +x ./infra/scripts/setup-azure-oidc.sh
./infra/scripts/setup-azure-oidc.sh "Adejarbas" "BioDash_mobile" "rg-biodash-prod" "brazilsouth"
```

O script imprimirá os 4 segredos a serem adicionados no GitHub (`Settings` -> `Secrets and variables` -> `Actions`):
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP_NAME`

---

## 6. Como Fazer o Deploy Manual via Azure CLI

Caso deseje executar o deploy localmente pela linha de comando:

```bash
# 1. Conectar na Azure
az login

# 2. Definir a subscription ativa
az account set --subscription "<SUA-SUBSCRIPTION-ID>"

# 3. Criar o Resource Group
az group create --name rg-biodash-prod --location brazilsouth

# 4. Validar o template Bicep
az deployment group validate \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json

# 5. Executar o What-If (prévia de alterações)
az deployment group what-if \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json

# 6. Executar o Deploy
az deployment group create \
  --resource-group rg-biodash-prod \
  --template-file ./infra/main.bicep \
  --parameters ./infra/main.parameters.json
```

---

## 7. Pipeline Automatizado no GitHub Actions

Toda alteração na pasta `/infra` disparada em branches autorizadas (`main`, `feat/azure-bicep`, `feat/azure-integration`) aciona automaticamente o workflow `.github/workflows/infra-deploy.yml`:
1. Validação e Lint do Bicep (`az bicep build`).
2. Login OIDC na Azure sem uso de senhas.
3. Prévia de mudanças com `az deployment group what-if`.
4. Deploy incremental automatizado utilizando `azure/arm-deploy@v2`.
5. Publicação do relatório no Job Summary do GitHub com os links dos serviços provisionados.
