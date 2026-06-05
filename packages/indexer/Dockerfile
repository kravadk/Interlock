# Interlock Recorder Service — build and run from the monorepo root.
#   docker build -f packages/indexer/Dockerfile -t agentops-indexer .
#   docker run -p 8787:8787 --env-file packages/indexer/.env agentops-indexer
#
# Node 22+ is required for the built-in node:sqlite (DatabaseSync) API.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/indexer/package.json packages/indexer/

# Install deps for just the two packages the indexer needs.
RUN pnpm install --filter @interlock/indexer... --frozen-lockfile

# Copy sources and build shared + indexer to dist/.
COPY packages/shared packages/shared
COPY packages/indexer packages/indexer
RUN pnpm --filter @interlock/shared build && pnpm --filter @interlock/indexer build

EXPOSE 8787
# Persist the SQLite DB on a mounted volume in production: -v interlock-db:/data
ENV INDEXER_DB_PATH=/data/interlock-indexer.sqlite
VOLUME ["/data"]

WORKDIR /app/packages/indexer
CMD ["node", "dist/server.js"]
