# Optimized Dockerfile with Playwright support
# Image size reduced by:
# - Using slim base image (~200MB saved)
# - Removing unnecessary system deps (~50MB saved)
# - Not copying source files (~10MB saved)
# - Using multi-stage builds efficiently

FROM oven/bun:1-slim AS base
WORKDIR /usr/src/app

# Install production dependencies only
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build stage (separate from install to leverage caching)
FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN bun run build

# Final release stage
FROM base AS release

# Install minimal system dependencies
# Only what's needed for Playwright Chromium + PostgreSQL client
RUN apt-get update && apt-get install -y \
    # Playwright Chromium essentials only
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    # Database + utilities
    postgresql-client \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy production dependencies
COPY --from=install /temp/prod/node_modules node_modules

# Copy compiled application (NOT source files)
COPY --from=build /usr/src/app/dist/server.js server.js
COPY --from=build /usr/src/app/package.json .

# Copy runtime files only
COPY --from=build /usr/src/app/drizzle ./drizzle
COPY --from=build /usr/src/app/drizzle.config.ts .
COPY --from=build /usr/src/app/scripts ./scripts
COPY --from=build /usr/src/app/docker ./docker
COPY --from=build /usr/src/app/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Setup permissions
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chown -R bun:bun /usr/src/app && \
    mkdir -p uploads && \
    chown -R bun:bun uploads

# Switch to non-root user
USER bun

# Install Chromium for Playwright
RUN bunx playwright-core install chromium --with-deps

EXPOSE 8000/tcp
ENTRYPOINT [ "/usr/local/bin/docker-entrypoint.sh" ]
