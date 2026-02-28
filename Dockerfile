FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source (cache bust: v2)
COPY src/ src/
COPY migrations/ migrations/
COPY openapi.yaml ./
COPY tsconfig.json ./

# Create data directory for SQLite (dev/fallback)
RUN mkdir -p data

# Health check
# Railway provides its own healthcheck via railway.json
# HEALTHCHECK removed — Railway uses PORT env dynamically

# Expose REST API port
EXPOSE 3000

# Configuration via environment
ENV SCHELLING_REST=true
ENV SCHELLING_REST_PORT=3000
# Set DB_TYPE=postgres and DATABASE_URL for production
# ENV DB_TYPE=postgres
# ENV DATABASE_URL=postgres://user:pass@host:5432/schelling

# Copy seed script
COPY scripts/auto-seed.ts scripts/

# Start server, then auto-seed in background if DB is empty
CMD ["sh", "-c", "bun src/index.ts --rest & sleep 2 && bun scripts/auto-seed.ts && wait"]
