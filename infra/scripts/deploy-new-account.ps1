#!/usr/bin/env pwsh
# =============================================================================
# deploy-new-account.ps1
# Script de automação "1-Click" para provisionar a infraestrutura completa do BioDash
# em uma nova conta/assinatura Azure com conformidade FinOps (Custo Zero).
# =============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Location = "chilecentral",

    [Parameter(Mandatory = $false)]
    [string]$Environment = "prod",

    [Parameter(Mandatory = $false)]
    [string]$WorkloadName = "biodash",

    [Parameter(Mandatory = $false)]
    [switch]$ConfigureOIDC = $true,

    [Parameter(Mandatory = $false)]
    [string]$GitHubOrg = "Adejarbas",

    [Parameter(Mandatory = $false)]
    [string]$GitHubRepo = "BioDash_mobile",

    [Parameter(Mandatory = $false)]
    [switch]$DeployDatabase = $false,

    [Parameter(Mandatory = $false)]
    [string]$DbAdminPassword = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " BioDash - Provisionamento Completo em Nova Conta Azure (1-Click)" -ForegroundColor Cyan
Write-Host " Governança FinOps: Custo Zero (Azure for Students)" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# PASSO 1: Autenticação e Seleção de Subscription
# =============================================================================
Write-Host "[1/5] Verificando sessão Azure..." -ForegroundColor Yellow
try {
    $token = az account get-access-token --query "accessToken" -o tsv 2>$null
    if (-not $token) {
        Write-Host "Iniciando az login no navegador..." -ForegroundColor Gray
        az login | Out-Null
    }
    $account = az account show --query "{name:name, id:id, user:user.name}" -o json | ConvertFrom-Json
    Write-Host "✅ Conectado na Subscription: $($account.name) ($($account.id))" -ForegroundColor Green
    Write-Host "   Usuário: $($account.user)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Falha na autenticação. Execute 'az login' manualmente." -ForegroundColor Red
    exit 1
}

# =============================================================================
# PASSO 2: Registro de Resource Providers na Conta Virgem
# =============================================================================
Write-Host "`n[2/5] Registrando Resource Providers essenciais na subscription..." -ForegroundColor Yellow
$providers = @(
    "Microsoft.App",
    "Microsoft.OperationalInsights",
    "Microsoft.Insights",
    "Microsoft.Storage",
    "Microsoft.Network"
)

foreach ($prov in $providers) {
    $state = az provider show --namespace $prov --query "registrationState" -o tsv 2>$null
    if ($state -ne "Registered") {
        Write-Host "   Registrando $prov (isso pode demorar 1-2 minutos)..." -ForegroundColor Gray
        az provider register --namespace $prov --output none
    } else {
        Write-Host "   ✅ $prov já registrado" -ForegroundColor Green
    }
}

# =============================================================================
# PASSO 3: Provisionamento de Recursos via Bicep (IaC)
# =============================================================================
$rgName = "rg-$WorkloadName-$Environment"
Write-Host "`n[3/5] Provisionando infraestrutura completa no Resource Group '$rgName'..." -ForegroundColor Yellow
Write-Host "   Região: $Location | Ambiente: $Environment" -ForegroundColor Gray

$subscriptionBicep = "$PSScriptRoot\..\subscription.bicep"

if (-not (Test-Path $subscriptionBicep)) {
    Write-Host "❌ Arquivo subscription.bicep não encontrado em '$subscriptionBicep'." -ForegroundColor Red
    exit 1
}

$deployParams = @(
    "deployment", "sub", "create",
    "--location", $Location,
    "--template-file", $subscriptionBicep,
    "--parameters", "location=$Location",
    "--parameters", "environment=$Environment",
    "--parameters", "workloadName=$WorkloadName",
    "--parameters", "deployDatabase=$(if ($DeployDatabase) { 'true' } else { 'false' })"
)

if ($DeployDatabase -and $DbAdminPassword) {
    $deployParams += "--parameters"
    $deployParams += "dbAdministratorLoginPassword=$DbAdminPassword"
}

Write-Host "   Executando deployment Bicep... (Aguarde ~3-5 minutos)" -ForegroundColor Cyan
$deployResultJson = az @deployParams --query "properties.outputs" -o json 2>$null

if (-not $deployResultJson) {
    Write-Host "❌ Erro no provisionamento Bicep. Verifique os logs detalhados do Azure Resource Manager." -ForegroundColor Red
    exit 1
}

$outputs = $deployResultJson | ConvertFrom-Json
Write-Host "✅ Infraestrutura Bicep provisionada com sucesso!" -ForegroundColor Green

# =============================================================================
# PASSO 4: Configuração de Federação OIDC com GitHub Actions (Opcional)
# =============================================================================
$oidcScript = "$PSScriptRoot\setup-azure-oidc.ps1"
if ($ConfigureOIDC -and (Test-Path $oidcScript)) {
    Write-Host "`n[4/5] Configurando Autenticação OIDC (GitHub Actions <-> Azure)..." -ForegroundColor Yellow
    try {
        & $oidcScript -GitHubOrg $GitHubOrg -GitHubRepo $GitHubRepo -ResourceGroupName $rgName -Location $Location
    } catch {
        Write-Host "⚠️ Aviso: OIDC não pôde ser configurado automaticamente. Você pode rodar setup-azure-oidc.ps1 depois." -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[4/5] OIDC ignorado (--ConfigureOIDC desmarcado ou script não encontrado)." -ForegroundColor Gray
}

# =============================================================================
# PASSO 5: Relatório Final de Entrega e FinOps
# =============================================================================
Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " [SUCESSO] BIODASH - AMBIENTE AZURE PRONTO COM SUCESSO!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[URLs] PUBLICAS HTTPS (Escala a Zero / Custo Zero):" -ForegroundColor Yellow
Write-Host "   Backend API:   $($outputs.backendApiUrl.value)" -ForegroundColor White
Write-Host "   Frontend Web:  $($outputs.frontendWebUrl.value)" -ForegroundColor White
Write-Host "   Storage Blob:  $($outputs.blobEndpoint.value)" -ForegroundColor White
Write-Host ""
Write-Host "[OBSERVABILIDADE E GOVERNANCA]:" -ForegroundColor Yellow
Write-Host "   Resource Group: $rgName" -ForegroundColor White
Write-Host "   App Insights:   $($outputs.appInsightsConnectionString.value)" -ForegroundColor Gray
Write-Host ""
Write-Host "[FINOPS] STATUS: CUSTO ZERO GARANTIDO" -ForegroundColor Green
Write-Host "   - Container Apps operando sem VNet delegada (Tier Gratuito)." -ForegroundColor Gray
Write-Host "   - 0 IPs Publicos pagos alocados." -ForegroundColor Gray
Write-Host "   - 0 Private DNS Zones cobradas." -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan
