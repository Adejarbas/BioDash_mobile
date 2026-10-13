#!/usr/bin/env pwsh
# =============================================================================
# cleanup-paid-resources.ps1
# Remove recursos do Azure que estavam gerando cobrança indevida no projeto BioDash
# Causa: Container Apps Environment integrado à VNet → DNS Private Zone + IP público pagos
# =============================================================================

param(
    [Parameter(Mandatory = $false)]
    [string]$ResourceGroup = "rg-biodash-prod",

    [Parameter(Mandatory = $false)]
    [string]$SubscriptionId = "",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " BioDash - Limpeza de Recursos Pagos no Azure" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "[DRY RUN] Modo simulação - nenhum recurso será deletado" -ForegroundColor Yellow
    Write-Host ""
}

# Verifica login Azure
Write-Host "Verificando autenticação Azure..." -ForegroundColor Gray
try {
    $account = az account show --query "name" -o tsv 2>/dev/null
    if (-not $account) {
        Write-Host "Você não está logado. Execute: az login" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Logado como: $account" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro: Execute 'az login' primeiro." -ForegroundColor Red
    exit 1
}

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
    Write-Host "✅ Subscription definida: $SubscriptionId" -ForegroundColor Green
}

Write-Host ""
Write-Host "Resource Group alvo: $ResourceGroup" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# PASSO 1: Deletar Container Apps (devem ser deletados antes do Environment)
# =============================================================================
Write-Host "️  PASSO 1: Removendo Container Apps..." -ForegroundColor Magenta

$containerApps = az containerapp list --resource-group $ResourceGroup --query "[].name" -o tsv 2>/dev/null
if ($containerApps) {
    foreach ($app in ($containerApps -split "`n" | Where-Object { $_ })) {
        Write-Host "   Deletando Container App: $app"
        if (-not $DryRun) {
            az containerapp delete --name $app --resource-group $ResourceGroup --yes
        }
    }
    Write-Host "   Container Apps removidos" -ForegroundColor Green
} else {
    Write-Host "   Nenhum Container App encontrado" -ForegroundColor Gray
}

# =============================================================================
# PASSO 2: Deletar Container Apps Environment (libera IP público)
# =============================================================================
Write-Host ""
Write-Host "  PASSO 2: Removendo Container Apps Environment (libera IP público)..." -ForegroundColor Magenta

$caeList = az containerapp env list --resource-group $ResourceGroup --query "[].name" -o tsv 2>/dev/null
if ($caeList) {
    foreach ($cae in ($caeList -split "`n" | Where-Object { $_ })) {
        Write-Host "   Deletando Container Apps Environment: $cae"
        if (-not $DryRun) {
            az containerapp env delete --name $cae --resource-group $ResourceGroup --yes
            Write-Host "   Aguardando deleção do environment (pode demorar 2-3 minutos)..."
            Start-Sleep -Seconds 60
        }
    }
    Write-Host "   Container Apps Environment removido" -ForegroundColor Green
} else {
    Write-Host "   Nenhum Container Apps Environment encontrado" -ForegroundColor Gray
}

# =============================================================================
# PASSO 3: Deletar DNS Private Zones (cobradas pelo Azure)
# =============================================================================
Write-Host ""
Write-Host "  PASSO 3: Removendo Azure DNS Private Zones pagas..." -ForegroundColor Magenta

$privateZones = az network private-dns zone list --resource-group $ResourceGroup --query "[].name" -o tsv 2>/dev/null
if ($privateZones) {
    foreach ($zone in ($privateZones -split "`n" | Where-Object { $_ })) {
        Write-Host "   Deletando DNS Private Zone: $zone"
        if (-not $DryRun) {
            # Remove links antes de deletar a zona
            $links = az network private-dns link vnet list --resource-group $ResourceGroup --zone-name $zone --query "[].name" -o tsv 2>/dev/null
            if ($links) {
                foreach ($link in ($links -split "`n" | Where-Object { $_ })) {
                    az network private-dns link vnet delete --resource-group $ResourceGroup --zone-name $zone --name $link --yes
                }
            }
            az network private-dns zone delete --resource-group $ResourceGroup --name $zone --yes
        }
    }
    Write-Host "   DNS Private Zones removidas" -ForegroundColor Green
} else {
    Write-Host "   Nenhuma DNS Private Zone encontrada" -ForegroundColor Gray
}

# =============================================================================
# PASSO 4: Re-deploy com Bicep corrigido (sem VNet integration)
# =============================================================================
Write-Host ""
Write-Host " PASSO 4: Re-deploy da infraestrutura corrigida..." -ForegroundColor Magenta
Write-Host ""

$infraPath = Join-Path $PSScriptRoot ".." "main.bicep"
$paramsPath = Join-Path $PSScriptRoot ".." "main.parameters.json"

if (-not (Test-Path $infraPath)) {
    Write-Host "Arquivo main.bicep não encontrado. Execute manualmente:" -ForegroundColor Yellow
    Write-Host "az deployment group create --resource-group $ResourceGroup --template-file infra/main.bicep --parameters @infra/main.parameters.json" -ForegroundColor Gray
} else {
    if (-not $DryRun) {
        Write-Host "   Executando deploy Bicep (sem VNet integration = custo zero)..."
        az deployment group create `
            --resource-group $ResourceGroup `
            --template-file $infraPath `
            --parameters @$paramsPath `
            --verbose
        Write-Host "   Re-deploy concluido!" -ForegroundColor Green
    } else {
        Write-Host "   [DRY RUN] Execute manualmente apos revisar" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Custo esperado apos limpeza: R$0,00 / mes" -ForegroundColor Green
Write-Host "Verifique em 24-48h: https://portal.azure.com/#view/Microsoft_Azure_CostManagement" -ForegroundColor Yellow
