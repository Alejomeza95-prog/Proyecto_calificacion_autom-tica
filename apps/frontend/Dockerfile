# Imagen de desarrollo del frontend (desde docker/templates/frontend.Dockerfile.example).
FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
