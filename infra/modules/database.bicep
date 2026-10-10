@description('Localização dos recursos de banco de dados')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('Nome de usuário administrador do PostgreSQL')
param administratorLogin string = 'biodashadmin'

@description('Senha do administrador do PostgreSQL')
@secure()
param administratorLoginPassword string

@description('ID da Subnet delegada para PostgreSQL (opcional para VNet integration)')
param dbSubnetId string = ''

@description('Tags padrão para governança e FinOps')
param tags object = {}

var cleanWorkload = replace(toLower(workloadName), '-', '')
var cleanEnv = replace(toLower(environment), '-', '')
var uniqueSuffix = take(uniqueString(resourceGroup().id, workloadName), 4)
var serverName = 'psql-${cleanWorkload}-${cleanEnv}-${uniqueSuffix}'
var databaseName = 'biodash_db'

// ============================================================================
// Azure Database for PostgreSQL Flexible Server (Burstable B1ms - Custo Zero)
// ============================================================================
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms' // 1 vCPU, 2 GiB RAM - Elegível à gratuidade de até 750 horas/mês
    tier: 'Burstable'
  }
  properties: {
    version: '15'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: 32 // Menor tamanho possível para garantir gratuidade
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: !empty(dbSubnetId) ? {
      delegatedSubnetResourceId: dbSubnetId
    } : {}
  }
}

// ============================================================================
// Regras de Firewall para permitir acesso seguro a partir de serviços Azure e CI/CD
// ============================================================================
resource allowAzureServicesFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = if (empty(dbSubnetId)) {
  parent: postgresServer
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource allowAllExternalFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = if (empty(dbSubnetId)) {
  parent: postgresServer
  name: 'AllowAllExternalIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// ============================================================================
// Habilitação de Extensões PostgreSQL (pgcrypto para bcrypt e UUIDs)
// ============================================================================
resource azureExtensionsConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-03-01-preview' = {
  parent: postgresServer
  name: 'azure.extensions'
  properties: {
    value: 'PGCRYPTO,UUID-OSSP'
    source: 'user-override'
  }
}

// ============================================================================
// Banco de dados padrão
// ============================================================================
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: postgresServer
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('ID do Servidor PostgreSQL Flexible Server')
output serverId string = postgresServer.id

@description('Nome do Servidor PostgreSQL')
output serverName string = postgresServer.name

@description('FQDN do Servidor PostgreSQL')
output serverFqdn string = postgresServer.properties.fullyQualifiedDomainName

@description('Nome do Banco de Dados')
output databaseName string = database.name

@description('Connection string formatada para o pool de conexões (Node.js pg)')
@secure()
output connectionString string = 'postgres://${administratorLogin}:${uriComponent(administratorLoginPassword)}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
