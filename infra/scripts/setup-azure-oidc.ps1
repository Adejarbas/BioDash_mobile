<#
.SYNOPSIS
    Script de automação para configuração de Autenticação OIDC (OpenID Connect)
    entre o GitHub Actions e o Microsoft Azure (Entra ID).

.DESCRIPTION
    Marco 4 - Governança e Segurança Cloud (Cloud Azure & IaC Bicep).
    Configura autenticação passwordless (zero chaves estáticas, zero segredos de longa duração)
    através de Federação de Identidade OIDC.

.PARAMETER GitHubOrg
    Organização ou usuário do GitHub (ex: Adejarbas).
.PARAMETER GitHubRepo
    Nome do repositório no GitHub (ex: BioDash_mobile).
.PARAMETER ResourceGroupName
    Nome do Resource Group de destino no Azure (ex: rg-biodash-prod).
.PARAMETER Location
    Região padrão da Azure (ex: brazilsouth).

.EXAMPLE
    .\setup-azure-oidc.ps1 -GitHubOrg "Adejarbas" -GitHubRepo "BioDash_mobile" -ResourceGroupName "rg-biodash-prod"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$GitHubOrg = "Adejarbas",

    [Parameter(Mandatory = $false)]
    [string]$GitHubRepo = "BioDash_mobile",

    [Parameter(Mandatory = $false)]
    [string]$ResourceGroupName = "rg-biodash-prod",

    [Parameter(Mandatory = $false)]
    [string]$Location = "brazilsouth"
)

Write-Host " [Marco 4] Configuração de OIDC (GitHub Actions <-> Microsoft Azure)" -ForegroundColor Cyan
Write-Host " Responsável: Cloud Azure & IaC Bicep" -ForegroundColor Cyan
Write-Host " Repositório: $GitHubOrg/$GitHubRepo" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Obter informações da Subscription ativa
Write-Host "`n[1/5] Verificando contexto do Azure CLI..." -ForegroundColor Yellow
$accountJson = az account show --output json | ConvertFrom-Json
if (-not $accountJson) {
    Write-Error "Erro: Nenhuma conta Azure conectada. Execute 'az login' primeiro."
    exit 1
}

$subscriptionId = $accountJson.id
$tenantId = $accountJson.tenantId
Write-Host " -> Subscription ID: $subscriptionId" -ForegroundColor Green
Write-Host " -> Tenant ID:       $tenantId" -ForegroundColor Green

# 2. Criar ou validar Resource Group
Write-Host "`n[2/5] Garantindo a existência do Resource Group '$ResourceGroupName'..." -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location --tags Project=BioDash FinOps=CostZero ManagedBy=Bicep-IaC --output none
Write-Host " -> Resource Group pronto na região '$Location'." -ForegroundColor Green

# 3. Criar App Registration no Microsoft Entra ID
$appName = "app-github-actions-$GitHubRepo"
Write-Host "`n[3/5] Criando App Registration no Microsoft Entra ID ('$appName')..." -ForegroundColor Yellow

$existingAppId = az ad app list --display-name $appName --query "[0].appId" -o tsv
if ([string]::IsNullOrWhiteSpace($existingAppId)) {
    $appId = az ad app create --display-name $appName --query "appId" -o tsv
    Write-Host " -> Novo App Registration criado com Client ID: $appId" -ForegroundColor Green
} else {
    $appId = $existingAppId
    Write-Host " -> App Registration já existe. Reutilizando Client ID: $appId" -ForegroundColor Green
}

# Criar Service Principal associado
$spId = az ad sp list --filter "appId eq '$appId'" --query "[0].id" -o tsv
if ([string]::IsNullOrWhiteSpace($spId)) {
    $spId = az ad sp create --id $appId --query "id" -o tsv
    Write-Host " -> Service Principal criado: $spId" -ForegroundColor Green
} else {
    Write-Host " -> Service Principal já existente: $spId" -ForegroundColor Green
}

# 4. Criar Credenciais Federadas (Federated Identity Credentials) para GitHub Actions
Write-Host "`n[4/5] Configurando Credenciais Federadas (OIDC Subject Claims)..." -ForegroundColor Yellow

$branches = @("main", "feat/azure-bicep", "feat/azure-integration")

foreach ($branch in $branches) {
    $cleanBranchName = $branch -replace "[^a-zA-Z0-9-]", "-"
    $credName = "gh-branch-$cleanBranchName"
    $subject = "repo:${GitHubOrg}/${GitHubRepo}:ref:refs/heads/${branch}"

    $credentialParameters = @{
        name = $credName
        issuer = "https://token.actions.githubusercontent.com"
        subject = $subject
        description = "Credencial federada OIDC para branch $branch do GitHub Actions"
        audiences = @("api://AzureADTokenExchange")
    } | ConvertTo-Json -Compress

    # Salva json temporario para passar ao comando az
    $tempFile = [System.IO.Path]::GetTempFileName()
    $credentialParameters | Out-File -FilePath $tempFile -Encoding utf8

    Write-Host " -> Configurando federação para branch: $branch" -ForegroundColor Cyan
    az ad app federated-credential create --id $appId --parameters $tempFile --output none 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    (Credencial '$credName' já configurada ou atualizada)" -ForegroundColor DarkGray
    }
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
}

# Credencial para Pull Requests
$prCredName = "gh-pull-requests"
$prSubject = "repo:${GitHubOrg}/${GitHubRepo}:pull_request"
$prParameters = @{
    name = $prCredName
    issuer = "https://token.actions.githubusercontent.com"
    subject = $prSubject
    description = "Credencial federada OIDC para Pull Requests"
    audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress
$tempFilePR = [System.IO.Path]::GetTempFileName()
$prParameters | Out-File -FilePath $tempFilePR -Encoding utf8
az ad app federated-credential create --id $appId --parameters $tempFilePR --output none 2>$null
Remove-Item -Path $tempFilePR -Force -ErrorAction SilentlyContinue

# 5. Atribuir Papel de Contributor (RBAC) no Resource Group
Write-Host "`n[5/5] Concedendo papel 'Contributor' no Resource Group..." -ForegroundColor Yellow
$scope = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroupName"
az role assignment create --role "Contributor" --assignee-object-id $spId --assignee-principal-type "ServicePrincipal" --scope $scope --output none
Write-Host " -> Permissão 'Contributor' concedida com sucesso no escopo: $scope" -ForegroundColor Green

# Resumo Final e Segredos do GitHub
Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host " SUCESSO! A Federação OIDC está configurada." -ForegroundColor Green
Write-Host " Adicione os seguintes Secrets no seu Repositório do GitHub:" -ForegroundColor Green
Write-Host " (Settings -> Secrets and variables -> Actions -> New repository secret)" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "AZURE_CLIENT_ID:           $appId" -ForegroundColor Yellow
Write-Host "AZURE_TENANT_ID:           $tenantId" -ForegroundColor Yellow
Write-Host "AZURE_SUBSCRIPTION_ID:     $subscriptionId" -ForegroundColor Yellow
Write-Host "AZURE_RESOURCE_GROUP_NAME: $ResourceGroupName" -ForegroundColor Yellow
Write-Host "=================================================================`n" -ForegroundColor Green
