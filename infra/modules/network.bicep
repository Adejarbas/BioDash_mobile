@description('Localização dos recursos de rede')
param location string

@description('Nome do ambiente (ex: dev, prod, staging)')
param environment string

@description('Nome base da carga de trabalho')
param workloadName string

@description('Prefixo CIDR da Rede Virtual (VNet)')
param vnetAddressPrefix string = '10.0.0.0/16'


@description('Prefixo CIDR da Subnet para Banco de Dados (PostgreSQL Flexible Server - desativado por padrão)')
param dbSubnetPrefix string = '10.0.4.0/24'

@description('Tags padrão para governança e FinOps')
param tags object = {}

var nsgName = 'nsg-${workloadName}-${environment}'
var vnetName = 'vnet-${workloadName}-${environment}'

// ============================================================================
// Network Security Group (NSG) com Regras Estritas de Firewall
// ============================================================================
resource nsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: nsgName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'Allow-HTTP-Inbound'
        properties: {
          description: 'Permitir tráfego HTTP de entrada para serviços web e reverse proxy'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 100
          direction: 'Inbound'
        }
      }
      {
        name: 'Allow-HTTPS-Inbound'
        properties: {
          description: 'Permitir tráfego HTTPS seguro de entrada da Internet'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 110
          direction: 'Inbound'
        }
      }
      {
        name: 'Allow-API-Inbound'
        properties: {
          description: 'Permitir tráfego de entrada na porta da API Express (3003)'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '3003'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 120
          direction: 'Inbound'
        }
      }
      {
        name: 'Deny-Database-Internet'
        properties: {
          description: 'FinOps & Segurança: Bloquear estritamente qualquer acesso direto da Internet à porta do PostgreSQL (5432)'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '5432'
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
          access: 'Deny'
          priority: 200
          direction: 'Inbound'
        }
      }
      {
        name: 'Allow-VNet-Internal'
        properties: {
          description: 'Permitir comunicação segura interna entre os microserviços na VNet'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: 'VirtualNetwork'
          access: 'Allow'
          priority: 300
          direction: 'Inbound'
        }
      }
    ]
  }
}

// ============================================================================
// Virtual Network (VNet) e Subnets Estruturadas
// ============================================================================
resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
    subnets: [
      // FinOps: Subnet de ACA REMOVIDA. Não delegamos mais subnet para
      // 'Microsoft.App/environments' pois isso cria DNS Private Zone paga.
      // O Container Apps Environment opera em modo público (sem VNet) = custo zero.
      {
        name: 'snet-db'
        properties: {
          addressPrefix: dbSubnetPrefix
          networkSecurityGroup: {
            id: nsg.id
          }
          // Delegação para PostgreSQL Flexible Server (ativada apenas quando deployDatabase=true)
          delegations: [
            {
              name: 'pg-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

// ============================================================================
// Outputs
// ============================================================================
@description('ID do Resource do NSG')
output nsgId string = nsg.id

@description('Nome do NSG')
output nsgName string = nsg.name

@description('ID da VNet')
output vnetId string = vnet.id

@description('Nome da VNet')
output vnetName string = vnet.name

// FinOps: output de acaSubnetId REMOVIDO. O Container Apps Environment NÃO
// deve ser integrado à VNet no tier Azure for Students (gera cobrança de IP público dedicado).

@description('ID da Subnet para Banco de Dados Relacional (PostgreSQL Flexible Server)')
output dbSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'snet-db')
