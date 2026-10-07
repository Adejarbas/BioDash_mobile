targetScope = 'subscription'

@description('Localização do Resource Group e recursos')
param location string = 'brazilsouth'

@description('Ambiente de execução (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string = 'prod'

@description('Nome base da carga de trabalho / projeto')
param workloadName string = 'biodash'

@description('Nome do Resource Group a ser criado')
param resourceGroupName string = 'rg-${workloadName}-${environment}'

@description('Imagem Docker Hub da API Backend')
param backendImage string = 'docker.io/adejarbas/biodash-api:latest'

@description('Imagem Docker Hub do Frontend Mobile Web')
param frontendImage string = 'docker.io/adejarbas/biodash_mobile:latest'

@description('Usuário do Docker Hub (opcional)')
param dockerHubUsername string = ''

@description('Token/Senha do Docker Hub (opcional)')
@secure()
param dockerHubPassword string = ''

@description('Habilitar provisionamento do Azure Database for PostgreSQL')
param deployDatabase bool = false

@description('Usuário administrador do PostgreSQL')
param dbAdministratorLogin string = 'biodashadmin'

@description('Senha do administrador do PostgreSQL')
@secure()
param dbAdministratorLoginPassword string = ''

@description('Tags personalizadas')
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
// Criação do Resource Group Dedicado
// ============================================================================
resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// ============================================================================
// Deploy do Módulo Principal (main.bicep) dentro do Resource Group
// ============================================================================
module mainDeployment './main.bicep' = {
  name: 'deploy-biodash-main-${environment}'
  scope: rg
  params: {
    location: location
    environment: environment
    workloadName: workloadName
    backendImage: backendImage
    frontendImage: frontendImage
    dockerHubUsername: dockerHubUsername
    dockerHubPassword: dockerHubPassword
    deployDatabase: deployDatabase
    dbAdministratorLogin: dbAdministratorLogin
    dbAdministratorLoginPassword: dbAdministratorLoginPassword
    customTags: tags
  }
}

// ============================================================================
// Outputs em Nível de Subscription
// ============================================================================
@description('Nome do Resource Group criado')
output resourceGroupName string = rg.name

@description('URL pública HTTPS do Backend API')
output backendApiUrl string = mainDeployment.outputs.backendApiUrl

@description('URL pública HTTPS do Frontend Web/Mobile')
output frontendWebUrl string = mainDeployment.outputs.frontendWebUrl

@description('Nome da Storage Account provisionada')
output storageAccountName string = mainDeployment.outputs.storageAccountName

@description('Endpoint do Blob Storage')
output blobEndpoint string = mainDeployment.outputs.blobEndpoint

@description('Connection String do Application Insights')
output appInsightsConnectionString string = mainDeployment.outputs.appInsightsConnectionString
