# ───────────────────────────────────────────────────────────
# Stage 1 — Install dependencies & compile TypeScript
# ───────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ───────────────────────────────────────────────────────────
# Stage 2 — Production image (minimal)
# ───────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:20-alpine AS production

WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Switch to non-root
USER appuser

EXPOSE 8080

CMD ["node", "dist/index.js"]
