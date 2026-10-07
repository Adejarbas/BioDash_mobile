@description('Localização dos recursos de identidade')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('Tags padrão para governança')
param tags object = {}

var managedIdentityName = 'id-${workloadName}-${environment}'

// ============================================================================
// User-Assigned Managed Identity para Workloads (Container Apps)
// ============================================================================
// Elimina o uso de senhas ou chaves estáticas, aderindo ao padrão de segurança moderna
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

// ============================================================================
// Outputs
// ============================================================================
@description('ID completo do Resource da Managed Identity')
output identityId string = managedIdentity.id

@description('Nome da Managed Identity')
output identityName string = managedIdentity.name

@description('Client ID (usado por DefaultAzureCredential e SDKs)')
output clientId string = managedIdentity.properties.clientId

@description('Principal ID (Object ID usado em Role Assignments de RBAC)')
output principalId string = managedIdentity.properties.principalId
