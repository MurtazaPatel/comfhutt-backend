# ───────────────────────────────────────────────────────────
# Stage 1 — Install dependencies & compile TypeScript
# ───────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --prod false

COPY tsconfig.json ./
COPY packages/types/tsconfig.json ./packages/types/
COPY packages/types/src ./packages/types/src
COPY src ./src

RUN npm run build

# ───────────────────────────────────────────────────────────
# Stage 2 — Production image (minimal)
# ───────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE 8080

CMD ["node", "dist/index.js"]
