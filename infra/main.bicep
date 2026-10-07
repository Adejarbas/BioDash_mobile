targetScope = 'resourceGroup'

@description('Localização primária dos recursos (padrão: localização do Resource Group)')
param location string = resourceGroup().location

@description('Ambiente de execução (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string = 'prod'

@description('Nome base da carga de trabalho / projeto')
param workloadName string = 'biodash'

@description('Imagem Docker Hub da API Backend')
param backendImage string = 'docker.io/adejarbas/biodash-api:latest'

@description('Imagem Docker Hub do Frontend Mobile Web')
param frontendImage string = 'docker.io/adejarbas/biodash_mobile:latest'

@description('Usuário do Docker Hub (opcional se imagens forem públicas)')
param dockerHubUsername string = ''

@description('Token/Senha do Docker Hub (opcional se imagens forem públicas)')
@secure()
param dockerHubPassword string = ''

@description('Habilitar provisionamento do Azure Database for PostgreSQL Flexible Server')
param deployDatabase bool = false

@description('Usuário administrador do PostgreSQL (obrigatório se deployDatabase = true)')
param dbAdministratorLogin string = 'biodashadmin'

@description('Senha do administrador do PostgreSQL (obrigatório se deployDatabase = true)')
@secure()
param dbAdministratorLoginPassword string = ''

@description('Connection string externa para PostgreSQL (caso deployDatabase seja false)')
@secure()
param externalDatabaseConnectionString string = ''

@description('URL do Supabase (opcional)')
param supabaseUrl string = ''

@description('Chave Anônima do Supabase (opcional)')
@secure()
param supabaseAnonKey string = ''

@description('Tags globais para governança e FinOps')
param customTags object = {}

var defaultTags = {
  Project: 'BioDash'
  Environment: environment
  ManagedBy: 'Bicep-IaC'
  Role: 'Cloud-IaC'
  FinOpsTier: 'Azure-For-Students-Cost-Zero'
}

var tags = union(defaultTags, customTags)

// ============================================================================
// Módulo 1: Rede e Segurança (VNet + Subnets + NSG)
// ============================================================================
module networkModule './modules/network.bicep' = {
  name: 'deploy-network-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    tags: tags
  }
}

// ============================================================================
// Módulo 2: Identidade Gerenciada (User-Assigned Managed Identity)
// ============================================================================
module identityModule './modules/identity.bicep' = {
  name: 'deploy-identity-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    tags: tags
  }
}

// ============================================================================
// Módulo 3: Observabilidade (Log Analytics + Application Insights para OTel)
// ============================================================================
module monitoringModule './modules/monitoring.bicep' = {
  name: 'deploy-monitoring-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    retentionInDays: 30
    dailyQuotaGb: 1
    tags: tags
  }
}

// ============================================================================
// Módulo 4: Armazenamento Blob (Storage Account + Container 'avatars')
// ============================================================================
module storageModule './modules/storage.bicep' = {
  name: 'deploy-storage-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    managedIdentityPrincipalId: identityModule.outputs.principalId
    tags: tags
  }
}

// ============================================================================
// Módulo 5: Ambiente Gerenciado de Contêineres (Azure Container Apps Environment)
// ============================================================================
module containerAppsEnvModule './modules/container-apps-env.bicep' = {
  name: 'deploy-cae-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    logAnalyticsCustomerId: monitoringModule.outputs.logAnalyticsCustomerId
    logAnalyticsPrimaryKey: monitoringModule.outputs.logAnalyticsPrimaryKey
    tags: tags
  }
}

// ============================================================================
// Módulo 6: Banco de Dados Relacional (PostgreSQL Flexible Server B1ms - Opcional)
// ============================================================================
module databaseModule './modules/database.bicep' = if (deployDatabase) {
  name: 'deploy-database-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    administratorLogin: dbAdministratorLogin
    administratorLoginPassword: dbAdministratorLoginPassword
    tags: tags
  }
}

// Resolução da connection string de banco de dados
var resolvedDbConnectionString = deployDatabase
  ? (databaseModule.?outputs.connectionString ?? '')
  : externalDatabaseConnectionString

// ============================================================================
// Módulo 7: Execução de Contêineres (Azure Container Apps com Escala a Zero)
// ============================================================================
module containerAppsModule './modules/container-apps.bicep' = {
  name: 'deploy-container-apps-${environment}'
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    containerAppsEnvironmentId: containerAppsEnvModule.outputs.containerAppsEnvId
    userAssignedIdentityId: identityModule.outputs.identityId
    userAssignedIdentityClientId: identityModule.outputs.clientId
    backendImage: backendImage
    frontendImage: frontendImage
    appInsightsConnectionString: monitoringModule.outputs.appInsightsConnectionString
    storageAccountName: storageModule.outputs.storageAccountName
    avatarsContainerName: storageModule.outputs.avatarsContainerName
    databaseConnectionString: resolvedDbConnectionString
    supabaseUrl: supabaseUrl
    supabaseAnonKey: supabaseAnonKey
    dockerHubUsername: dockerHubUsername
    dockerHubPassword: dockerHubPassword
    tags: tags
  }
}

// ============================================================================
// Outputs Finais de Governança e Integração
// ============================================================================
@description('URL pública HTTPS do Backend API')
output backendApiUrl string = containerAppsModule.outputs.backendUrl

@description('FQDN público do Backend API')
output backendApiFqdn string = containerAppsModule.outputs.backendFqdn

@description('URL pública HTTPS do Frontend Web/Mobile')
output frontendWebUrl string = containerAppsModule.outputs.frontendUrl

@description('FQDN público do Frontend Web/Mobile')
output frontendWebFqdn string = containerAppsModule.outputs.frontendFqdn

@description('Nome da Storage Account provisionada')
output storageAccountName string = storageModule.outputs.storageAccountName

@description('Endpoint primário do Blob Storage')
output blobEndpoint string = storageModule.outputs.blobEndpoint

@description('Nome do container para avatares e fotos de biodigestores')
output avatarsContainerName string = storageModule.outputs.avatarsContainerName

@description('Connection String do Application Insights para OpenTelemetry')
output appInsightsConnectionString string = monitoringModule.outputs.appInsightsConnectionString

@description('Client ID da Managed Identity para autenticação sem senha')
output managedIdentityClientId string = identityModule.outputs.clientId

@description('Nome da Virtual Network')
output vnetName string = networkModule.outputs.vnetName

@description('Nome do Network Security Group')
output nsgName string = networkModule.outputs.nsgName
