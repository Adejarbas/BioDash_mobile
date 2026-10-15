# ADR: Remoção Total de Resquícios e Desacoplamento Residual da AWS

**Data de Geração:** 14/10/2026 21:08:00 (UTC-3)
**Commit:** refactor(storage): remove legacy aws remnants and decouple url parsing

**Contexto:**
Durante a auditoria de conformidade com as diretrizes do projeto de migração para o Microsoft Azure ([migra_o_aws_para_azure.md](../tasks/migra_o_aws_para_azure.md)), identificou-se que, embora o ecossistema estivesse operando com o cliente desacoplado [storage.ts](../../src/lib/storage.ts) e adaptadores do Azure Blob Storage, ainda persistiam resquícios legados na base de código do frontend:
1. Existência do arquivo [aws-s3.ts](../../src/lib/aws-s3.ts), mantido anteriormente como fachada de retrocompatibilidade;
2. Validação condicional explícita no componente [CompanyProfileScreen.tsx](../../src/screens/CompanyProfileScreen.tsx) verificando a substring `'amazonaws.com/'`;
3. URLs de fallback e comentários mencionando o antigo host em EC2 e domínio DuckDNS em [api.ts](../../src/lib/api.ts) e [docker-release.sh](../../docker-release.sh).

Esses resquícios violavam a diretriz estrita de Desacoplamento e o Critério de Aceite 5.(e) (*"não houver chamadas de rede ou SDKs remanescentes da AWS no código de produção"*).

**Decisão:**
1. Excluir definitivamente o arquivo `src/lib/aws-s3.ts`, uma vez que todos os consumidores já utilizam a API agnóstica de storage.
2. Substituir a checagem rígida de provedor em `CompanyProfileScreen.tsx` por um analisador universal de URLs que extrai dinamicamente o caminho do objeto sem acoplamento a domínios de qualquer provedor de nuvem.
3. Padronizar as URLs de fallback locais e exemplos operacionais para o Azure Container Apps e ambiente local (`localhost:3003`).

**Consequências:**
- **Positivas:** Eliminação completa de vendor lock-in no código-fonte; conformidade total com o Critério de Aceite 5.(e); base de código mais limpa e padronizada.
- **Riscos Mitigados:** O extrator agnóstico de URLs continua garantindo compatibilidade com registros históricos gravados em banco de dados antes da migração, sem manter nomes de serviços proprietários no código.
