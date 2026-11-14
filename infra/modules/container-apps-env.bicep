@description('Localização dos recursos de Container Apps Environment')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('ID do Customer do Log Analytics Workspace')
param logAnalyticsCustomerId string

@description('Primary Shared Key do Log Analytics Workspace')
@secure()
param logAnalyticsPrimaryKey string

@description('ID da Subnet da VNet para integração de rede (opcional)')
param infrastructureSubnetId string = ''

@description('Tags padrão para governança')
param tags object = {}

var environmentName = 'cae-${workloadName}-${environment}'

// ============================================================================
// Azure Container Apps Managed Environment
// ============================================================================
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimaryKey
      }
    }
    vnetConfiguration: !empty(infrastructureSubnetId) ? {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    } : null
    zoneRedundant: false // FinOps: false para evitar custos adicionais de redundância de zona no tier de estudante
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('ID do Managed Environment do Container Apps')
output containerAppsEnvId string = containerAppsEnv.id

@description('Nome do Managed Environment')
output containerAppsEnvName string = containerAppsEnv.name

@description('Domínio padrão gerado pelo Container Apps Environment')
output defaultDomain string = containerAppsEnv.properties.defaultDomain
