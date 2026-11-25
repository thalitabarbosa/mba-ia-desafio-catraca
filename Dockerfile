# syntax=docker/dockerfile:1
# O secret opcional "npm_ca" permite instalar dependências atrás de proxy corporativo com CA próprio;
# sem ele (caso normal), o npm usa os certificados padrão.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; npm ci

FROM deps AS test
COPY . .
CMD ["npm", "test"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev
COPY src ./src
EXPOSE 3000
CMD ["node", "src/main.js"]
