# Chatbot com reconhecimento de voz

O navegador e o aplicativo acessam somente a API do BioDash em `http://localhost:3003/api`.
O backend consulta os dados do usuário e encaminha chatbot, busca semântica e transcrição para o
serviço Python privado em `http://127.0.0.1:5000`.

## Desenvolvimento local

1. No repositório `BioDashBD`, configure `POSTGRES_URL`, `JWT_SECRET`,
   `FRONTEND_URL=http://localhost:8081` e `AI_SERVICE_URL=http://127.0.0.1:5000`.
2. Se as tabelas ainda não existirem, execute `db/migrations/001_chatbot.sql` no PostgreSQL.
3. Inicie o backend com `npm run dev` no `BioDashBD`.
4. Neste repositório, inicie a IA com `npm run ai`.
5. Em outro terminal, inicie o frontend com `npm run web`.

Na primeira transcrição, o `faster-whisper` baixa o modelo configurado por `WHISPER_MODEL`
(`small` por padrão, com melhor precisão em português). O download ocorre uma única vez e fica
no cache local. Para máquinas com pouca memória, use `WHISPER_MODEL=base`; para priorizar ainda
mais a precisão, use `WHISPER_MODEL=medium`.

## Comportamento do microfone

- Toque uma vez para começar e toque novamente para concluir.
- Mantenha pressionado para gravar e solte para concluir.
- Chrome/Edge usam Web Speech quando disponível.
- Outros navegadores usam `MediaRecorder` e a rota autenticada `/api/chatbot/transcribe`.

Em produção, o frontend precisa ser servido por HTTPS para o navegador liberar o microfone.
