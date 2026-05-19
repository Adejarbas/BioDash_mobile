FROM node:20-alpine

WORKDIR /app

# Copia manifesto de dependências
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --only=production

# Copia código fonte
COPY src/ ./src/

# Expõe a porta do servidor Express
EXPOSE 3003

# Health check interno
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3003/api/health || exit 1

# Inicia o servidor
CMD ["node", "src/server.js"]
