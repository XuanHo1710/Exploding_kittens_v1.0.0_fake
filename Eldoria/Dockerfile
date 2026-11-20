# Eldoria: Forgotten Wilds — Multi-Stage Local Self-Hosted Container Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/game-config/package.json packages/game-config/
COPY apps/game-server/package.json apps/game-server/
COPY apps/client/package.json apps/client/

RUN npm install

COPY packages/ packages/
COPY apps/ apps/
COPY game-data/ game-data/

RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/game-config/dist ./packages/game-config/dist
COPY --from=builder /app/packages/game-config/package.json ./packages/game-config/
COPY --from=builder /app/apps/game-server/dist ./apps/game-server/dist
COPY --from=builder /app/apps/game-server/package.json ./apps/game-server/
COPY --from=builder /app/apps/client/dist ./apps/client/dist

RUN mkdir -p /app/data/db /app/data/backups /app/logs && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "apps/game-server/dist/main.js"]
