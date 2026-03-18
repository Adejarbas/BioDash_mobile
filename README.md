# BioDash

## Sistema de Gestão de Biodigestores

Monitore e otimize o desempenho do seu biodigestor com nosso dashboard completo e intuitivo.

---

## Navegação

- **BioDash**
- **Entrar**
- **Registrar**

---

## Seções Principais

### Escolha seu plano de assinatura

#### **Plano Essencial**
- R$500/mês
- Gestão completa de biodigestores
- Dashboard de indicadores
- Suporte dedicado

**Botão:** Assinar por R$500/mês

---

#### **Plano Profissional**
- R$1000/mês
- Gestão completa de biodigestores
- Dashboard de indicadores
- Suporte dedicado

**Botão:** Assinar por R$1000/mês

---

#### **Plano Premium**
- R$1500/mês
- Gestão completa de biodigestores
- Dashboard de indicadores
- Suporte dedicado

**Botão:** Assinar por R$1500/mês

---

## Avaliações dos Usuários

Nenhuma avaliação cadastrada ainda.

---

## Nossos Diferenciais

### 🔹 Rastreamento de Resíduos
Monitore a quantidade de resíduos processados pelo seu biodigestor em tempo real.

---

### 🔹 Geração de Energia
Acompanhe a energia produzida pelo seu sistema com análises detalhadas.

---

### 🔹 Benefícios Fiscais
Calcule e visualize os benefícios fiscais da sua produção de energia sustentável.

---

### 🔹 Requisitos Funcionais 

<img width="504" height="265" alt="image" src="https://github.com/user-attachments/assets/5e40d68f-cd26-4a56-8204-981aa6c3844d" />


### 🔹 Requisitos Não Funcionais 

<img width="504" height="635" alt="image" src="https://github.com/user-attachments/assets/bda9b730-64ee-42d9-8052-e58f97e60c8d" />





## Rodapé

©️ 2024 BioDash. Todos os direitos reservados.

Links úteis:
- Termos
- Privacidade
- Contato

---

## Configuração MongoDB (Histórico do Mapa)

Para produção, o app nao deve acessar MongoDB direto. Foi criado um backend seguro em `server/index.js`.

### 1) Backend seguro

Crie `server/.env` com base em `server/.env.example` e preencha:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (recomendado)
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `MONGODB_COLLECTION`
- `CORS_ORIGINS` (origens permitidas)

Inicie o backend:

- `npm run server` (produção)
- `npm run server:dev` (desenvolvimento)

### Teste rapido sem MongoDB

Se quiser validar apenas o fluxo de ponta a ponta sem ter MongoDB ainda:

- No `server/.env`, defina `USE_IN_MEMORY_DB=true`
- Deixe `MONGODB_URI` vazio
- Rode `npm run server`

Nesse modo, os endpoints funcionam normalmente, mas os dados ficam em memoria e sao perdidos quando o servidor reinicia.

### 2) App mobile

No `.env` do app, configure:

- `EXPO_PUBLIC_API_BASE_URL`

Exemplo: `http://localhost:3003`

### 3) Endpoints criados

- `GET /api/map-history` (autenticado por Bearer token Supabase)
- `POST /api/map-history` (autenticado por Bearer token Supabase)

Fluxo:

- O app envia o token da sessão Supabase no header `Authorization`.
- O backend valida token no Supabase e usa `user.id` para leitura/escrita no MongoDB.
- A chave do MongoDB fica apenas no backend.
