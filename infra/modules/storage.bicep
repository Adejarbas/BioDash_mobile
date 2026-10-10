@description('Localização dos recursos de storage')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('Principal ID da Managed Identity para concessão de RBAC (opcional)')
param managedIdentityPrincipalId string = ''

@description('Tags padrão para governança')
param tags object = {}

// O nome da Storage Account deve ser globalmente único, conter apenas letras minúsculas e números, entre 3 e 24 caracteres.
var cleanWorkload = replace(toLower(workloadName), '-', '')
var cleanEnv = replace(toLower(environment), '-', '')
var uniqueSuffix = take(uniqueString(resourceGroup().id, workloadName), 6)
var storageAccountName = take('st${cleanWorkload}${cleanEnv}${uniqueSuffix}', 24)

// Built-in Role ID para 'Storage Blob Data Contributor'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// ============================================================================
// Storage Account (Custo Zero - SKU Standard_LRS)
// ============================================================================
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS' // Local Redundant Storage: menor custo e ideal para desenvolvimento/acadêmico
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false // Segurança: sem exposição anônima pública; acesso via SAS Token ou Managed Identity
    allowSharedKeyAccess: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    encryption: {
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

// ============================================================================
// Blob Service e Regras de CORS (para uploads diretos via SAS Token pelo App)
// ============================================================================
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            '*'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'PUT'
            'DELETE'
            'HEAD'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            '*'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

// ============================================================================
// Container 'avatars' (Destino das fotos do perfil do usuário e biodigestor)
// ============================================================================
resource avatarsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'avatars'
  properties: {
    publicAccess: 'None' // Acesso restrito via SAS tokens assinados
  }
}

// ============================================================================
// Container 'documents' (Relatórios técnicos e comprovantes)
// ============================================================================
resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'documents'
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================================
// Role Assignment (RBAC): Storage Blob Data Contributor para a Managed Identity
// ============================================================================
resource blobContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(managedIdentityPrincipalId)) {
  name: guid(storageAccount.id, managedIdentityPrincipalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('ID do Resource da Storage Account')
output storageAccountId string = storageAccount.id

@description('Nome único da Storage Account')
output storageAccountName string = storageAccount.name

@description('Endpoint primário do serviço de Blob')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob

@description('Nome do container de avatares/fotos')
output avatarsContainerName string = avatarsContainer.name

@description('Nome do container de documentos')
output documentsContainerName string = documentsContainer.name
