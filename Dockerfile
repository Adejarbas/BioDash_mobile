# Estágio de build
FROM node:18-alpine AS build

WORKDIR /app

# Copia os arquivos de manifesto de dependências
COPY package.json yarn.lock* package-lock.json* ./

# Instala as dependências
RUN npm install

# Copia o restante dos arquivos da aplicação
COPY . .

# Build da aplicação para web
RUN npm run web

# Estágio de produção
FROM nginx:stable-alpine

# Copia os arquivos de build do estágio anterior
COPY --from=build /app/web-build /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Comando para iniciar o servidor NGINX
CMD ["nginx", "-g", "daemon off;"]
