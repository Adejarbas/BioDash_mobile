# ADR: Arquitetura de CI/CD Multi-Job com Quality Gates, Cache Docker e Sanitização de Segredos

**Data de Geração:** 2026-10-10 14:28:00
**Commit:** ci(pipeline): implement multi-job pipeline, gha docker cache and credential sanitization

**Contexto:**
O repositório `BioDash_mobile` mantinha o workflow mobile/web em formato de job único monolítico, sem Quality Gate de tipagem TypeScript e com build Docker sem reaproveitamento de cache (`no-cache: true`). Além disso, o pipeline de IaC Bicep (`infra-deploy.yml`) repassava o segredo `DB_ADMIN_PASSWORD` diretamente sem tratamento de caracteres de escape ou quebras de linha (`\r\n`), o que causou falhas de autenticação no PostgreSQL do Azure devido à injeção de `%0A`.

**Decisão:**
1. Refatoração do workflow `mobile-ci-cd.yml` em arquitetura multi-job:
   - `validate`: Quality Gate estático com `npm run typecheck` (`tsc --noEmit`).
   - `build-and-push`: Empacotamento Docker Web com cache GHA nativo (`cache-from: type=gha`, `cache-to: type=gha,mode=max`).
   - `deploy-azure`: Deploy no `ca-biodash-web-prod` com Smoke Test ativo (HTTP 200 no FQDN Web) e integração com GitHub Environment `production`.
2. Adição de etapa de sanitização e mascaramento de segredos no workflow `infra-deploy.yml` (`tr -d '\r\n'`) para blindar o provisionamento ARM/Bicep contra quebras de linha acidentais.
3. Padronização do suporte às branches `feat/azure-ci-improvements` e `feat/azure-integration`.

**Consequências:**
- **Positivas:** Otimização substancial do tempo de build do web app; segurança aumentada no provisionamento do banco de dados na nuvem; rastreabilidade de deployments no GitHub; isolamento de falhas por estágio.
- **Riscos e Ações Futuras:** Commits subsequentes devem respeitar as regras estritas de tipagem do TypeScript do Expo para não quebrar o estágio de `validate`.
