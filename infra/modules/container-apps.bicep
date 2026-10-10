@description('Localização dos recursos de Container Apps')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('ID do Azure Container Apps Managed Environment')
param containerAppsEnvironmentId string

@description('ID da Managed Identity associada aos Container Apps')
param userAssignedIdentityId string

@description('Client ID da Managed Identity')
param userAssignedIdentityClientId string

@description('Imagem Docker Hub da API Backend')
param backendImage string = 'docker.io/thiagohmn93/biodashbd:latest'

@description('Imagem Docker Hub do Frontend Mobile Web')
param frontendImage string = 'docker.io/thiagohmn93/biodash_mobile:latest'

@description('Connection String do Application Insights')
@secure()
param appInsightsConnectionString string = ''

@description('Nome da Storage Account de fotos/avatares')
param storageAccountName string

@description('Nome do container Blob de avatares')
param avatarsContainerName string = 'avatars'

@description('Connection String do Banco de Dados PostgreSQL (opcional)')
@secure()
param databaseConnectionString string = ''

@description('URL do Supabase (opcional)')
param supabaseUrl string = ''

@description('Anon Key do Supabase (opcional)')
@secure()
param supabaseAnonKey string = ''

@description('Docker Hub Registry Server (padrão: index.docker.io/v1/ ou docker.io)')
param dockerHubServer string = 'index.docker.io/v1/'

@description('Usuário Docker Hub (deixe em branco se a imagem for pública)')
param dockerHubUsername string = ''

@description('Token/Senha do Docker Hub (deixe em branco se a imagem for pública)')
@secure()
param dockerHubPassword string = ''

@description('Tags padrão para governança e FinOps')
param tags object = {}

var backendAppName = 'ca-${workloadName}-api-${environment}'
var frontendAppName = 'ca-${workloadName}-web-${environment}'

var hasDockerHubAuth = !empty(dockerHubUsername) && !empty(dockerHubPassword)

// ============================================================================
// Azure Container App - Backend API (Express / Node.js)
// ============================================================================
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3003
        transport: 'auto'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: [
            '*'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'PUT'
            'DELETE'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
        }
      }
      secrets: array(
        filter([
          !empty(appInsightsConnectionString) ? {
            name: 'appinsights-connection-string'
            value: appInsightsConnectionString
          } : null
          !empty(databaseConnectionString) ? {
            name: 'database-connection-string'
            value: databaseConnectionString
          } : null
          !empty(supabaseAnonKey) ? {
            name: 'supabase-anon-key'
            value: supabaseAnonKey
          } : null
          hasDockerHubAuth ? {
            name: 'dockerhub-password'
            value: dockerHubPassword
          } : null
        ], item => item != null)
      )
      registries: hasDockerHubAuth ? [
        {
          server: dockerHubServer
          username: dockerHubUsername
          passwordSecretRef: 'dockerhub-password'
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'biodash-api'
          image: backendImage
          resources: {
            // FinOps Custo Zero: 0.25 vCPU e 0.5Gi de RAM garantem consumo ínfimo da cota gratuita
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '3003'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storageAccountName
            }
            {
              name: 'AZURE_STORAGE_CONTAINER_NAME'
              value: avatarsContainerName
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: userAssignedIdentityClientId
            }
            {
              name: 'SUPABASE_URL'
              value: supabaseUrl
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: !empty(appInsightsConnectionString) ? 'appinsights-connection-string' : null
              value: empty(appInsightsConnectionString) ? '' : null
            }
            {
              name: 'POSTGRES_URL'
              secretRef: !empty(databaseConnectionString) ? 'database-connection-string' : null
              value: empty(databaseConnectionString) ? '' : null
            }
            {
              name: 'DATABASE_URL'
              secretRef: !empty(databaseConnectionString) ? 'database-connection-string' : null
              value: empty(databaseConnectionString) ? '' : null
            }
            {
              name: 'SUPABASE_ANON_KEY'
              secretRef: !empty(supabaseAnonKey) ? 'supabase-anon-key' : null
              value: empty(supabaseAnonKey) ? '' : null
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/alerts'
                port: 3003
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              failureThreshold: 3
              timeoutSeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/alerts'
                port: 3003
              }
              initialDelaySeconds: 10
              periodSeconds: 20
              failureThreshold: 3
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        // ====================================================================
        // FinOps CRÍTICO: minReplicas = 0 (Escala a Zero quando ocioso)
        // maxReplicas = 1 (Impede estouro de cota e garante custo $0.00)
        // ====================================================================
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http-scaling-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// Azure Container App - Frontend Mobile Web (Nginx / Expo Web)
// ============================================================================
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      secrets: hasDockerHubAuth ? [
        {
          name: 'dockerhub-password'
          value: dockerHubPassword
        }
      ] : []
      registries: hasDockerHubAuth ? [
        {
          server: dockerHubServer
          username: dockerHubUsername
          passwordSecretRef: 'dockerhub-password'
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'biodash-web'
          image: frontendImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'EXPO_PUBLIC_API_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}/api'
            }
            {
              name: 'EXPO_PUBLIC_NEXT_API_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}/api'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: {
        // Escala a zero quando ocioso
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http-scaling-rule'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('FQDN público da API Backend')
output backendFqdn string = backendApp.properties.configuration.ingress.fqdn

@description('URL HTTPS completa da API Backend')
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'

@description('FQDN público do Frontend Mobile Web')
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn

@description('URL HTTPS completa do Frontend Mobile Web')
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'

@description('ID do Resource do Backend Container App')
output backendAppId string = backendApp.id

@description('ID do Resource do Frontend Container App')
output frontendAppId string = frontendApp.id
