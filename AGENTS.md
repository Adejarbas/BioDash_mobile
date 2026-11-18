# Regras e Diretrizes para IA (Agent Guidelines)

## 🚨 REGRA CRÍTICA: Conventional Commits e Versionamento SemVer

Este repositório utiliza automação de CI/CD baseada em **Conventional Commits** para cálculo automático de versão SemVer e publicação de tags/releases Docker.

### 1. NUNCA faça commits fora do padrão
Qualquer commit criado DEVE seguir rigorosamente a convenção:
`<tipo>(<escopo opcional>): <descrição no imperativo>`

### 2. Mapeamento de Tipos e Impacto no SemVer
- `feat: ...` -> **MINOR** (ex: `1.0.0` -> `1.1.0`). Use para novas funcionalidades, novas telas, componentes, integrações.
- `fix: ...` -> **PATCH** (ex: `1.0.0` -> `1.0.1`). Use para correções de bugs.
- `feat!: ...` ou corpo com `BREAKING CHANGE:` -> **MAJOR** (ex: `1.0.0` -> `2.0.0`). Use para alterações incompatíveis com versões anteriores.
- `chore: ...` -> Tarefas de manutenção, dependências, scripts (NÃO gera bump de versão).
- `docs: ...` -> Documentação apenas (NÃO gera bump de versão).
- `refactor: ...` -> Refatoração que não corrige bug nem adiciona funcionalidade.
- `test: ...` -> Adição ou alteração de testes.
- `ci: ...` -> Mudanças no GitHub Actions ou scripts de deploy.
- `style: ...` -> Formatação, ponto e vírgula, sem mudança de código.

> ⚠️ **Atenção:** Se um commit de nova feature ou bugfix for feito com outro prefixo (ou sem prefixo), o pipeline de CI **NÃO gerará a tag SemVer**, causando falha na release.

### 3. Exemplos Práticos
- ✅ `feat: add push notifications handler`
- ✅ `feat(alerts): integrate sensor thresholds with websocket`
- ✅ `fix(auth): handle expired jwt refresh token`
- ✅ `chore(deps): bump expo to version 54`
- ❌ `add alerts` (Inválido - commit será bloqueado pelo git hook)
- ❌ `resolvido problema do sensor` (Inválido)
- ❌ `wip` ou `update` (Inválido)

### 4. Git Hooks
Existe um hook local em `.githooks/commit-msg` e um workflow no GitHub (`.github/workflows/commitlint.yml`). Qualquer mensagem fora desse padrão será rejeitada no terminal e na CI.

