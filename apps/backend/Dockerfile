# Imagen de desarrollo del backend (desde docker/templates/backend.Dockerfile.example).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable
EXPOSE 3000
CMD ["pnpm", "start:dev"]
