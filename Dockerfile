FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source
COPY src/ src/
COPY tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p data

# Expose REST API port
EXPOSE 3000

# Run in REST mode
ENV SCHELLING_REST=true
ENV SCHELLING_REST_PORT=3000

CMD ["bun", "src/index.ts", "--rest"]
