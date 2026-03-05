# ============================================================
# Dockerfile Otimizado para Hermes Frontend
# Tamanho estimado: ~50-70 MB
# ============================================================

# ============================================================
# Stage 1: Build
# ============================================================
FROM node:20-alpine AS build

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

WORKDIR /app

# Copiar arquivos de dependências primeiro (cache layer)
COPY package.json package-lock.json ./

# Instalar TODAS as dependências (incluindo dev para build)
RUN npm ci && \
    npm cache clean --force

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# ============================================================
# Stage 2: Produção (nginx)
# ============================================================
FROM nginx:1.27-alpine

# Copiar arquivos buildados
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar configuração do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remover arquivos desnecessários do nginx
RUN rm -rf /usr/share/nginx/html/*.map

# Expor porta
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Comando padrão do nginx
CMD ["nginx", "-g", "daemon off;"]
