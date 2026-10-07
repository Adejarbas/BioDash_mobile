#!/usr/bin/env bash
# ==============================================================================
# Script de Automação: Configuração de OIDC (GitHub Actions <-> Microsoft Azure)
# Marco 4 - Governança Cloud e DevOps (Cloud Azure & IaC Bicep)
# ==============================================================================

set -euo pipefail

GITHUB_ORG="${1:-Adejarbas}"
GITHUB_REPO="${2:-BioDash_mobile}"
RESOURCE_GROUP="${3:-rg-biodash-prod}"
LOCATION="${4:-brazilsouth}"

echo "================================================================="
echo " [Marco 4] Configuração OIDC (GitHub Actions <-> Microsoft Azure)"
echo " Responsável: Cloud Azure & IaC Bicep"
echo " Repositório: ${GITHUB_ORG}/${GITHUB_REPO}"
echo "================================================================="

# 1. Verificar contexto da Azure
echo -e "\n[1/5] Verificando contexto do Azure CLI..."
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo " -> Subscription ID: ${SUBSCRIPTION_ID}"
echo " -> Tenant ID:       ${TENANT_ID}"

# 2. Criar ou garantir Resource Group
echo -e "\n[2/5] Garantindo Resource Group '${RESOURCE_GROUP}'..."
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" \
  --tags Project=BioDash FinOps=CostZero ManagedBy=Bicep-IaC -o none
echo " -> Resource Group pronto."

# 3. Criar App Registration no Entra ID
APP_NAME="app-github-actions-${GITHUB_REPO}"
echo -e "\n[3/5] Criando ou localizando App Registration ('${APP_NAME}')..."

APP_ID=$(az ad app list --display-name "${APP_NAME}" --query "[0].appId" -o tsv || true)
if [ -z "${APP_ID}" ]; then
  APP_ID=$(az ad app create --display-name "${APP_NAME}" --query appId -o tsv)
  echo " -> Novo App Registration criado com Client ID: ${APP_ID}"
else
  echo " -> App Registration já existe. Reutilizando Client ID: ${APP_ID}"
fi

SP_ID=$(az ad sp list --filter "appId eq '${APP_ID}'" --query "[0].id" -o tsv || true)
if [ -z "${SP_ID}" ]; then
  SP_ID=$(az ad sp create --id "${APP_ID}" --query id -o tsv)
  echo " -> Service Principal criado: ${SP_ID}"
else
  echo " -> Service Principal existente: ${SP_ID}"
fi

# 4. Criar Credenciais Federadas para as branches
echo -e "\n[4/5] Configurando Credenciais Federadas (OIDC Subject Claims)..."

BRANCHES=("main" "feat/azure-bicep" "feat/azure-integration")

for BRANCH in "${BRANCHES[@]}"; do
  CLEAN_BRANCH=$(echo "${BRANCH}" | tr '/' '-')
  CRED_NAME="gh-branch-${CLEAN_BRANCH}"
  SUBJECT="repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/${BRANCH}"

  echo " -> Configurando federação para branch: ${BRANCH}"
  az ad app federated-credential create --id "${APP_ID}" --parameters "{
    \"name\": \"${CRED_NAME}\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"${SUBJECT}\",
    \"description\": \"Credencial federada OIDC para branch ${BRANCH}\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" -o none 2>/dev/null || echo "    (Credencial '${CRED_NAME}' já configurada)"
done

# Pull Request credential
echo " -> Configurando federação para Pull Requests..."
az ad app federated-credential create --id "${APP_ID}" --parameters "{
  \"name\": \"gh-pull-requests\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:pull_request\",
  \"description\": \"Credencial federada OIDC para PRs\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}" -o none 2>/dev/null || echo "    (Credencial 'gh-pull-requests' já configurada)"

# 5. Atribuir Papel Contributor
echo -e "\n[5/5] Concedendo papel 'Contributor' no Resource Group..."
SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"
az role assignment create --role "Contributor" \
  --assignee-object-id "${SP_ID}" \
  --assignee-principal-type "ServicePrincipal" \
  --scope "${SCOPE}" -o none
echo " -> Permissão concedida no escopo: ${SCOPE}"

echo -e "\n================================================================="
echo " SUCESSO! A Federação OIDC está configurada."
echo " Adicione os seguintes Secrets no seu Repositório GitHub:"
echo " (Settings -> Secrets and variables -> Actions -> New repository secret)"
echo "================================================================="
echo "AZURE_CLIENT_ID:           ${APP_ID}"
echo "AZURE_TENANT_ID:           ${TENANT_ID}"
echo "AZURE_SUBSCRIPTION_ID:     ${SUBSCRIPTION_ID}"
echo "AZURE_RESOURCE_GROUP_NAME: ${RESOURCE_GROUP}"
echo -e "=================================================================\n"
