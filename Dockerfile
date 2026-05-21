# Estágio de build
FROM node:20-alpine AS build

WORKDIR /app

# Copia os arquivos de manifesto de dependências
COPY package.json package-lock.json* ./

# Instala as dependências
RUN npm ci

# Copia o restante dos arquivos da aplicação
COPY . .

ARG EXPO_PUBLIC_API_URL=__API_URL_PLACEHOLDER__
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

# Build da aplicação para web
RUN npm run build:web

# Estágio de produção
FROM nginx:stable-alpine

# Configuração para SPA com fallback para index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos de build do estágio anterior
COPY --from=build /app/dist /usr/share/nginx/html

# Script para injetar a variável de ambiente em tempo de execução
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'echo "Injetando API URL: $RUNTIME_API_URL"' >> /entrypoint.sh && \
    echo 'find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|__API_URL_PLACEHOLDER__|$RUNTIME_API_URL|g" {} +' >> /entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Expõe a porta 80
EXPOSE 80

# Comando para iniciar o script customizado
CMD ["/entrypoint.sh"]
