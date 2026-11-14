# Evidências de Governança FinOps e Escala a Zero — Azure

**Projeto:** BioDash (Migração AWS $\rightarrow$ Azure)  
**Assinatura:** Azure for Students (MATHEUS GUEFF)  
**Marco de Referência:** Marco 5 (Entrega Final e Auditoria de Custos)  
**Data da Coleta:** 24 de Outubro de 2026  

---

## 1. Visão Geral das Evidências

Este diretório contém os registros visuais auditáveis que comprovam a conformidade do ambiente Microsoft Azure do **BioDash** com as diretrizes de **Custo Zero**, **governança FinOps** e **desacoplamento de rede** estabelecidas nas especificações do projeto.

---

## 2. Catálogo de Evidências

### 2.1. Análise de Custos e Estabilização da Curva
- **Arquivo:** `01_finops_cost_analysis_october.png`
- **Descrição:** Painel de Gerenciamento de Custos (*Cost Management*) da Azure.
- **Validação Técnica:**
  - Evidencia o custo acumulado de R$ 7,70 ocorrido durante os testes iniciais e provisionamento com VNet (02 a 12 de outubro).
  - Demonstra o **achatamento total da curva** a partir de 18 de outubro, comprovando que após a correção arquitetural (remoção da sub-rede do ACA e ativação rigorosa de `minReplicas: 0`), o acréscimo diário de custos foi estancado a R$ 0,00.

### 2.2. Rede e Eliminação de Recursos Pagos Ocultos
- **Arquivo:** `02_network_private_dns_zero.png`
  - **Serviço:** Base da rede | Zonas DNS privadas (*Private DNS Zones*)
  - **Evidência:** "Não há zonas privadas do dns para exibir" (0 de 0).
  - **Importância FinOps:** Garante que a taxa fixa de ~$0,50/mês por zona do Azure Private DNS não está sendo cobrada.
- **Arquivo:** `03_network_public_ips_zero.png`
  - **Serviço:** Base da rede | Endereços IP públicos (*Public IP Addresses*)
  - **Evidência:** "Não há endereços IP públicos para exibir" (0 de 0).
  - **Importância FinOps:** Confirma ausência de IPs públicos dedicados Standard órfãos vinculados à VNet.

### 2.3. Réplicas Ativas dos Azure Container Apps (Status: Dimensionado para 0)
- **Arquivo:** `04_aca_api_replica_zero.png`
  - **Serviço:** `ca-biodash-api-prod` (Backend API Express / Node.js)
  - **Status de Execução:** **Dimensionado para 0** | **Réplicas: 0**
  - **Tráfego Ativo:** 100% alocado na revisão `latest`.
- **Arquivo:** `05_aca_ai_replica_zero.png`
  - **Serviço:** `ca-biodash-ai-prod` (Chatbot / AI Service FastAPI + Whisper)
  - **Status de Execução:** **Dimensionado para 0** | **Réplicas: 0**
  - **Tráfego Ativo:** 100% alocado na revisão `latest`.
- **Arquivo:** `06_aca_web_replica_zero.png`
  - **Serviço:** `ca-biodash-web-prod` (Frontend Mobile Web Nginx / Expo Web)
  - **Status de Execução:** **Dimensionado para 0** | **Réplicas: 0**
  - **Tráfego Ativo:** 100% alocado na revisão `latest`.

### 2.4. Regras de Escalonamento Automático (Scale Rules e FinOps Limits)
- **Arquivo:** `07_aca_web_scale_rules.png`
  - **Serviço:** `ca-biodash-web-prod` | Configurações de Regra de Escala
  - **Parâmetros FinOps:**
    - **Mínimo de réplicas:** `0` (Garante escala a zero quando ocioso)
    - **Máximo de réplicas:** `1` (Teto estrito impedindo escalonamento descontrolado e estouro de cota)
    - **Período de resfriamento:** `300 segundos` (5 min de inatividade para drenagem de conexões antes do scale-to-zero)
    - **Intervalo de sondagem:** `30 segundos`
    - **Número atual de réplicas:** `0`
    - **Regra de escala:** `http-scaling-rule` (Tipo: Escala HTTP)
- **Arquivo:** `08_aca_api_scale_rules.png`
  - **Serviço:** `ca-biodash-api-prod` | Configurações de Regra de Escala
  - **Parâmetros FinOps:**
    - **Mínimo de réplicas:** `0`
    - **Máximo de réplicas:** `1`
    - **Período de resfriamento:** `300 segundos`
    - **Intervalo de sondagem:** `30 segundos`
    - **Número atual de réplicas:** `0`
    - **Regra de escala:** `http-scaling-rule` (Tipo: Escala HTTP)
- **Arquivo:** `09_aca_ai_scale_rules.png`
  - **Serviço:** `ca-biodash-ai-prod` | Configurações de Regra de Escala
  - **Parâmetros FinOps:**
    - **Mínimo de réplicas:** `0`
    - **Máximo de réplicas:** `1`
    - **Período de resfriamento:** `300 segundos`
    - **Intervalo de sondagem:** `30 segundos`
    - **Número atual de réplicas:** `0`
    - **Regra de escala:** `http-scaling-rule` (Tipo: Escala HTTP)

### 2.5. Auditoria de Custos por Resource Group
- **Arquivo:** `10_cost_by_resource_group.png`
  - **Descrição:** Visão de custos dividida entre os 2 Resource Groups da assinatura:
    - `rg-biodash-prod`: R$ 5,67 (RG principal da aplicação).
    - `me_managedenvironment-rgbiodashprod-9f27_rg-biodash-prod_chilecentral`: R$ 2,03 (RG gerenciado automaticamente pela Azure para o Container Apps Environment).
- **Arquivo:** `11_cost_details_managed_env_rg.png`
  - **Descrição:** Auditoria interna do grupo gerenciado `me_managedenvironment-...`:
    - `capp-svc-lb-ip` (Public IP Address): **R$ 2,03** (Causa raiz do custo de Virtual Network, alocado no início do mês e já removido).
    - `capp-svc-lb` (Load Balancer): **R$ 0,00** (Sem cobrança).
- **Arquivo:** `12_cost_details_main_rg.png`
  - **Descrição:** Auditoria interna do grupo principal `rg-biodash-prod`:
    - `ca-biodash-api-prod`: R$ 2,80 (Consumo pontual de vCPU na fase de testes).
    - `ca-biodash-web-prod`: R$ 1,79 (Consumo pontual de vCPU na fase de testes).
    - `ca-biodash-ai-prod`: R$ 0,82 (Consumo pontual de vCPU na fase de testes).
    - `psql-biodash.private.postgres.database.azure.com` (Private DNS Zone): R$ 0,26 (Zona privada do PostgreSQL criada no início do mês e já deletada).
    - Storage accounts, PostgreSQL Flexible Server e Log Analytics Workspaces: **R$ 0,00 / < R$ 0,01** (Cobertos pelo tier gratuito).

### 2.6. Auditoria de Custos Pós-Correção e Medidores Granulares
- **Arquivo:** `13_cost_filtered_oct14_oct23.png`
  - **Descrição:** Visão filtrada de 14 a 23 de outubro no grupo `rg-biodash-prod`.
  - **Validação Técnica:**
    - Custo acumulado no período de apenas R$ 1,91 (R$ 0,19/dia).
    - Custos de rede (Virtual Network) e DNS zerados (R$ 0,00).
- **Arquivo:** `14_cost_meters_detailed_breakdown.png`
  - **Descrição:** Abertura dos medidores (*meters*) de consumo no período de 14 a 23 de outubro.
  - **Validação Técnica:**
    - Comprova que os contêineres só foram tarifados em *Standard vCPU Active Usage* (API: R$ 0,75, Web: R$ 0,54, AI: R$ 0,25) e *Standard Memory Active Usage* (API: R$ 0,18, Web: R$ 0,13, AI: R$ 0,06).
    - Ausência total do medidor *Idle Usage*, atestando que os contêineres não geram custos quando ociosos.
    - Operações de Storage, PostgreSQL Flexible Server e Log Analytics operando com flag `- Free` e valor de **R$ 0,00**.

---

## 3. Conclusão da Auditoria

1. **Por que existiam 2 Resource Groups:** O `rg-biodash-prod` abriga os recursos provisionados pelo Bicep. O `me_managedenvironment-...` é um grupo de infraestrutura criado e mantido nos bastidores pela própria Azure para gerenciar o balanceador de carga e o IP do Container Apps Environment.
2. **Histórico Passado vs. Consumo Presente:** Os R$ 7,70 representam o consumo acumulado nas primeiras duas semanas de outubro. Os prints atuais comprovam que **IPs públicos e Zonas DNS privadas foram eliminados** e os contêineres estão em **0 réplicas ativas**.
3. **Consumo Ocioso Corrente Nulo:** A taxa de consumo atual na nuvem é rigorosamente **R$ 0,00 por hora**, preservando integralmente o saldo restante dos créditos do *Azure for Students*.
