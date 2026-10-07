@description('Localização dos recursos de observabilidade')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('Retenção de logs em dias (padrão 30 dias para tier gratuito)')
param retentionInDays int = 30

@description('Limite diário de ingestão em GB para proteção FinOps (0.5 GB/dia padrão)')
param dailyQuotaGb int = 1

@description('Tags padrão para governança')
param tags object = {}

var logAnalyticsName = 'log-${workloadName}-${environment}'
var appInsightsName = 'appi-${workloadName}-${environment}'

// ============================================================================
// Log Analytics Workspace (Base para OpenTelemetry e Container Apps)
// ============================================================================
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018' // SKU de pagamento por consumo (com franquia mensal gratuita no Azure for Students)
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: dailyQuotaGb
    }
    features: {
      searchVersion: 1
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// ============================================================================
// Application Insights (Workspace-based para Traces e Métricas OTel)
// ============================================================================
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('ID do Log Analytics Workspace')
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id

@description('Customer ID do Log Analytics (usado pelo Container Apps Environment)')
output logAnalyticsCustomerId string = logAnalyticsWorkspace.properties.customerId

@description('Primary Shared Key do Log Analytics')
output logAnalyticsPrimaryKey string = logAnalyticsWorkspace.listKeys().primarySharedKey

@description('ID do Application Insights')
output appInsightsId string = appInsights.id

@description('Nome do Application Insights')
output appInsightsName string = appInsights.name

@description('Connection String do Application Insights (injetada no OpenTelemetry)')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Instrumentation Key do Application Insights')
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
