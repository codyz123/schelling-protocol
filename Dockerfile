FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source
COPY src/ src/
COPY tsconfig.json ./

# Create data directory for SQLite (dev/fallback)
RUN mkdir -p data

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Expose REST API port
EXPOSE 3000

# Configuration via environment
ENV SCHELLING_REST=true
ENV SCHELLING_REST_PORT=3000
# Set DB_TYPE=postgres and DATABASE_URL for production
# ENV DB_TYPE=postgres
# ENV DATABASE_URL=postgres://user:pass@host:5432/schelling

CMD ["bun", "src/index.ts", "--rest"]
