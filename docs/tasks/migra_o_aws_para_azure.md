# MIGRAÇÃO AWS $\rightarrow$ AZURE
**Diretrizes para Desacoplamento Arquitetural, Governança Cloud e DevOps**

## 1. Objetivo
Este documento estabelece as diretrizes técnicas e os critérios de avaliação para o projeto de migração de um sistema multiplataforma, originalmente hospedado na Amazon Web Services (AWS), para o ecossistema Microsoft Azure. O objetivo central é desenvolver a maturidade arquitetural necessária para projetar sistemas distribuídos resilientes, portáveis e financeiramente sustentáveis, utilizando práticas modernas de Engenharia de Software, DevOps e FinOps.

## 2. Escopo do Projeto
O escopo compreende a refatoração e migração de uma aplicação conteinerizada (Docker) que utiliza serviços de computação, persistência, mensageria e observabilidade. O projeto exige a transição completa da infraestrutura, garantindo que a aplicação final opere no Azure com custo zero (dentro da assinatura Azure for Students), sem dependências residuais da AWS e com instrumentação de telemetria baseada em padrões abertos.

## 3. Checklist Oficial do Projeto

### 3.1 Diagnóstico Arquitetural Inicial
* Inventariar todos os serviços utilizados na AWS (Compute, Data, Storage, Networking, IAM, CI/CD).
* Classificar cada componente como: Agnóstico, Levemente Acoplado ou Altamente Acoplado.
* Identificar pontos críticos de lock-in no código-fonte.
* Definir a estratégia de migração para cada componente (Refactor ou Replatform).

### 3.2 Blindagem contra Lock-in (Ports & Adapters)
* Implementar interfaces (Ports) para camadas externas: Storage, Mensageria, Logging e Secrets.
* Desenvolver Adapters específicos para o Azure, mantendo os da AWS como referência.
* Garantir que o núcleo do domínio não referencie SDKs proprietários.
* Externalizar toda a configuração sensível via variáveis de ambiente.

### 3.3 Repositório de Imagens Docker
* Migrar imagens para GitHub Container Registry (GHCR) ou Docker Hub.
* Remover dependência do Amazon ECR.
* Proibir o uso de Azure Container Registry (ACR) para evitar consumo de créditos.
* Validar o fluxo de pull/push automatizado.

### 3.4 Infraestrutura de Rede no Azure
* Criar Resource Group dedicado e estruturado.
* Definir VNet, sub-redes e Network Security Groups (NSGs).
* Estabelecer regras de isolamento e controle de tráfego.
* Configurar Managed Identities para autenticação entre serviços.

### 3.5 Serviço de Execução de Contêineres
* Provisionar o Azure Container Apps (ACA) como ambiente de execução.
* Configurar escalonamento automático (KEDA) e escala a zero.
* Validar probes de liveness e readiness.
* Garantir a correta injeção de segredos e variáveis.

### 3.6 Migração da Persistência
* Banco relacional: migrar para Azure Database for PostgreSQL/MYSQL (Flexible Server).
* NoSQL: Transição de DynamoDB para Cosmos DB (API for MongoDB).
* Storage: Substituir chamadas S3 por Azure Blob Storage via adapter.

### 3.7 Mensageria e Eventos
* Substituir SQS por Azure Service Bus (Queues/Topics).
* Migrar SNS/EventBridge para Azure Event Grid.
* Testar a integridade das mensagens e políticas de retry (DLQ).

### 3.8 Observabilidade (OpenTelemetry)
* Instrumentar a aplicação utilizando OpenTelemetry (OTel).
* Configurar o envio de traces e logs para o Azure Monitor / Application Insights.
* Remover dependências de CloudWatch e AWS X-Ray.

### 3.9 Infraestrutura como Código (IaC)
* Traduzir manifestos Terraform/Bicep da AWS para o provider azurerm.
* Configurar o armazenamento do estado (state) em um Blob Container.
* Modularizar a infraestrutura para facilitar a manutenção.

### 3.10 Pipeline CI/CD
* Atualizar fluxos no GitHub Actions.
* Implementar autenticação via OIDC (OpenID Connect) com o Azure.
* Automatizar o deploy contínuo para o Azure Container Apps.

### 3.11 Testes de Validação
* Validar o comportamento de cold start do ambiente serverless.
* Executar testes de carga básicos para verificar limites de cota.
* Garantir a funcionalidade ponta a ponta após o corte da AWS.

### 3.12 Descomissionamento AWS
* Executar período de validação paralela.
* Encerrar recursos na AWS de forma ordenada.
* Validar a ausência de dependências ocultas (DNS, chaves, buckets).

## 4. Requisitos Técnicos
Para a execução do projeto, são obrigatórios: conta ativa no Azure for Students, utilização de Docker para conteinerização, Terraform ou Bicep para IaC, GitHub Actions para automação e OpenTelemetry para observabilidade. É vedado o uso de serviços que gerem cobrança fora do tier gratuito, como instâncias de Kubernetes (AKS) ou registros privados pagos (ACR).

## 5. Critérios de Aceite
O projeto será considerado aceito se: 
(a) a aplicação estiver funcional no Azure; 
(b) o custo operacional for zero; 
(c) a infraestrutura for provisionada via código; 
(d) a telemetria estiver visível no Azure Monitor; e 
(e) não houver chamadas de rede ou SDKs remanescentes da AWS no código de produção.

## 6. Fluxo de Entrega e Marcos (inserir como atividades no Product Backlog)
1. **Marco 1:** Relatório de Auditoria e Diagnóstico de Lock-in.
2. **Marco 2:** Refatoração do código (Adapters) e migração do Registry.
3. **Marco 3:** Provisionamento da Infraestrutura (IaC) e Rede no Azure.
4. **Marco 4:** Deploy funcional e configuração de CI/CD e OTel.
5. **Marco 5:** Entrega final, documentação e encerramento na AWS.

## 7. Rúbrica de Avaliação

| Dimensão | Critério de Excelência (2 pts) | Pontuação |
| :--- | :--- | :--- |
| **Desacoplamento** | Domínio isolado; Adapters claros; zero SDK proprietário no core. | 0-2 |
| **Governança/FinOps** | Custo zero; serviços gratuitos bem utilizados; zero desperdício. | 0-2 |
| **Observabilidade** | Full OTel; traces distribuídos e logs estruturados no Azure Monitor. | 0-2 |
| **IaC e Automação** | Infra 100% via código; CI/CD via OIDC; deploy sem intervenção manual. | 0-2 |
| **Execução Técnica** | Migração limpa; sistema resiliente; corte da AWS validado. | 0-2 |
| **Total (Máximo 10 pontos)** | | **0-10** |

## 8. Formato de Entrega Final Padronizado

### 8.1 Estrutura do Repositório
* `/src`: Código-fonte da aplicação e Adapters.
* `/infra`: Arquivos de Infraestrutura como Código (Terraform/Bicep).
* `/pipelines`: Definições de CI/CD (GitHub Actions).
* `/docs`: Documentação técnica e diagramas.

### 8.2 README Obrigatório
* Instruções de configuração do ambiente local.
* Guia de execução do deploy no Azure.
* Diagrama de arquitetura (Antes e Depois).
* Lista de variáveis de ambiente necessárias.

### 8.3 Documentação Técnica e PDF Final
* Relatório detalhando os desafios da migração.
* Evidências de funcionamento (prints de dashboards de telemetria).
* Análise de custos (FinOps).

### 8.4 Vídeo Demo (Opcional)
* Demonstração da aplicação funcionando e do fluxo de CI/CD em execução.

## 9. Considerações Finais
A migração entre provedores de nuvem é uma das tarefas mais complexas da engenharia moderna. Este projeto não avalia apenas a capacidade de codificação, mas a visão sistêmica do aluno sobre portabilidade e eficiência operacional. Espera-se que os grupos demonstrem proatividade na resolução de conflitos de rede e segurança nativos do Azure.

---

## Sugestão (passo a passo) para migração

Considerando a maturidade dos sistemas, deve-se pensar como uma transição arquitetural controlada, com foco em desacoplamento, reprodutibilidade, resiliência e governança. A sugestão é um passo a passo pragmático, técnico e orientado a evitar lock-in, desperdício de crédito e perda de rastreabilidade.

### 1) Auditoria Arquitetural Inicial (Diagnóstico de Acoplamento)
Antes de migrar qualquer recurso:
1. **Liste todos os componentes da solução:**
   * Compute (ECS, EC2, Lambda)
   * Data (RDS, DynamoDB, S3)
   * Mensageria (SQS, SNS, EventBridge)
   * Autenticação/IAM
   * VPC, subnets, SGs
   * CI/CD, logs, métricas
2. **Classifique cada item como:**
   * Agnóstico (Docker, PostgreSQL, Redis, REST API)
   * Levemente acoplado (SDKs AWS S3, SNS, CloudWatch)
   * Altamente acoplado (DynamoDB nativo, Cognito, SQS/SNS diretos, Lambda com eventos específicos)
3. **Defina o que será:**
   * Reutilizado sem mudanças
   * Adaptado
   * Reescrito

> Este diagnóstico evita 80% dos problemas posteriores.

### 2) Extrair o sistema do lock-in da AWS (Ports & Adapters)
Prepare o código para rodar em qualquer nuvem:
1. **Introduza camadas de abstração (Interfaces/Providers):**
   * `IFileStorage` $\rightarrow$ S3/Blob
   * `IQueueBroker` $\rightarrow$ SQS/Service Bus
   * `ISecretsProvider` $\rightarrow$ Secrets Manager/Key Vault
2. **Substitua chamadas diretas ao AWS SDK por adapters:**
   * Código de domínio não pode chamar boto3, aws-sdk, DynamoDBClient, etc.
3. **Parametrize tudo via:**
   * variáveis de ambiente
   * dotenv local
   * configuração externa no Azure (App Config / Key Vault)

> Após esse passo, o sistema já "sai" conceitualmente da AWS.

### 3) Estabelecer o Registro de Imagens (Critical FinOps Point)
* **Na AWS:** ECR
* **No Azure:** NÃO USE ACR - cobrado no Azure for Students!

**A estratégia correta:**
1. Migre todas as imagens Docker para GitHub Container Registry (GHCR) ou Docker Hub.
2. Reconfigure o pipeline para enviar as imagens para o GHCR.
3. Teste o `docker pull` localmente.

> Isso garante custo zero e elimina o vetor mais comum de estouro de crédito no Azure.

### 4) Provisionar a Topologia de Rede no Azure
Crie a estrutura mínima:
1. Resource Group
2. VNet + Subnets
3. NSGs para controlar tráfego
4. Identidade gerenciada para workloads

Use Terraform ou Bicep para garantir reprodutibilidade.
> A rede do Azure usa paradigma diferente de VPC/AZs, então a topologia deve ser explicitamente projetada.

### 5) Escolher o Serviço de Execução de Contêineres (Compute)
A opção técnica ideal para manter baixo custo + escalabilidade:
* **Azure Container Apps (ACA)** - *recomendado*
  * Serverless
  * Escala a zero
  * Pode usar Dapr e KEDA
  * Puxa imagem do GHCR sem custo
* **App Service for Containers (F1)** - *Alternativa mais simples*
  * Boa para APIs
  * Limite de CPU (60 min/dia) $\rightarrow$ restritivo para produção acadêmica

**Evite:**
* AKS (Kubernetes) $\rightarrow$ consome crédito
* VMs $\rightarrow$ administração pesada, estudantes vão errar governança

### 6) Migrar Persistência (Banco e Arquivos)
* **Para banco relacional (MySQL/Postgres):**
  * Provisione Azure Database for PostgreSQL/MySQL - Flexible Server
  * Ajuste connection string
* **Para NoSQL:**
  * DynamoDB $\rightarrow$ Cosmos DB (API for MongoDB)
  * Minimiza reescrita
  * Mantém queries e drivers
* **Para arquivos (S3 $\rightarrow$ Blob Storage):**
  * Reescreva apenas o adapter de storage
  * Mantenha interface universal

> Aqui emerge a importância da arquitetura hexagonal.

### 7) Migrar Mensageria e Eventos - camada adapter simplifica a troca
* SQS $\rightarrow$ Azure Service Bus (Queues/Topics)
* SNS $\rightarrow$ Azure Event Grid
* EventBridge $\rightarrow$ Event Grid ou Logic Apps.

### 8) Configurar Observabilidade (OpenTelemetry)
Crucial para análises e debug:
1. Instrumentar a aplicação com OTel (não usar SDK proprietário).
2. Criar pipeline de traces para:
   * Azure Monitor
   * Application Insights (via OTel Collector)

> Com OTel, a migração é reversível.

### 9) Reescrever ou adaptar o IaC (Terraform ou Bicep)
Não existe portabilidade automática:
* `provider "aws"` $\rightarrow$ `provider "azurerm"`
* Reescrever módulos
* Recriar estado (`terraform init -backend-config=...`) usando Blob Storage

> Aqui se aprende mais IaC do que em um semestre inteiro.

### 10) Reconfigurar CI/CD (GitHub Actions)
Atualizar pipeline:
1. Build & push para GHCR
2. Autenticar com Azure via OIDC (`azure/login`)
3. Deploy com:
   * `azure/container-apps-deploy-action`
   * `azure/webapps-deploy` (App Service)

> Zero senhas. Zero secrets. Segurança moderna.

### 11) Testes de Resiliência e Carga
* Cold start
* Latência na primeira chamada
* Requisições simultâneas
* Falhas de rede
* TTL de tokens
* Erros de adapter

> Só após esse passo você considera a migração tecnicamente concluída.

### 12) Corte da AWS (Descomissionamento Planejado)
1. Rodar em paralelo (Azure + AWS) por alguns dias.
2. Validar logs, billing, e erros.
3. Encerrar recursos da AWS de forma controlada.

### Resultado Final
* Aprendizado sobre arquitetura real (Hexagonal, Ports/Adapters);
* Compreensão sobre governança, FinOps e segurança;
* Desenvolvimento de visão profunda sobre diferenças em diferentes clouds;
* Capacidade de manutenção de aplicação portável e sustentável.