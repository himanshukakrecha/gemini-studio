# ── Build stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Install deps first (cached layer)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source
COPY server.js ./
COPY public/ ./public/

# ── Runtime ────────────────────────────────────────────────────────────────
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
