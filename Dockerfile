# syntax=docker/dockerfile:1

# 1. Build the web bundle (type-check + vite build).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2. Production dependencies only (the API runs through tsx, a runtime dependency).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 3. Runtime: one process serves the API (/api/*) and the built web app.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8787
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
USER node

# The port is only exposed to the container network; the reverse proxy (Traefik) publishes it.
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "server/index.ts"]
