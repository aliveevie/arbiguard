FROM node:20-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY skill/ ./skill/
COPY server/ ./server/

COPY arbiguard-ui/package.json arbiguard-ui/pnpm-lock.yaml ./arbiguard-ui/
WORKDIR /app/arbiguard-ui
RUN pnpm install --frozen-lockfile
COPY arbiguard-ui/ ./
RUN pnpm build

WORKDIR /app
RUN pnpm run build:server

FROM node:20-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY skill/detection/replays/*.json ./skill/detection/replays/
COPY skill/contracts/abi/ ./skill/contracts/abi/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
