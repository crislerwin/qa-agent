# Use the official Bun image
# See all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [optional] tests & build
ENV NODE_ENV=production
RUN bun run build

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/dist/server.js server.js
COPY --from=prerelease /usr/src/app/package.json .

# Copy database initialization files and scripts
COPY --from=prerelease /usr/src/app/docker ./docker
COPY --from=prerelease /usr/src/app/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Install system dependencies for Playwright, PostgreSQL client, and curl
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Make entrypoint executable and set proper ownership
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chown bun:bun /usr/local/bin/docker-entrypoint.sh

# Create uploads directory with proper permissions
RUN mkdir -p uploads && chown -R bun:bun uploads && chmod -R 755 uploads

# Switch to bun user
USER bun

# Install Chromium
RUN bunx playwright-core install chromium

# run the app
EXPOSE 8000/tcp
ENTRYPOINT [ "/usr/local/bin/docker-entrypoint.sh" ]
