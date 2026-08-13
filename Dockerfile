# Jackdaw — the zero-secret owner-UI image (extracted from the mantle
# monorepo's `client` target at the repo split, 2026-08-13).
#
# No DB, no SESSION_SECRET — runtime config is compose env
# (MANTLE_SERVER_ORIGIN) read per-request by /env.js, so ONE image serves any
# brain. The image name stays `mantle-client` for fleet compatibility; the
# compose file that runs it ships with the mantle deploy bundle.
FROM node:26-slim AS deps
WORKDIR /app

# Manifests first so the install layer caches when only source changes. Keep
# in sync with the workspace (client/* + packages/* + e2e).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY client/web/package.json client/web/package.json
COPY client/desktop/package.json client/desktop/package.json
COPY packages/web-ui/package.json packages/web-ui/package.json
COPY e2e/package.json e2e/package.json

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
    && npm install -g pnpm@11.1.2 \
    # client/desktop is a workspace member; skip the ~100MB electron binary
    # this image never runs (desktop builds happen in desktop.yml).
    && ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile \
    && apt-get purge -y python3 build-essential && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /root/.npm /root/.local/share/pnpm/store /root/.cache

COPY . .

FROM deps AS client
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG MANTLE_GIT_SHA=""
ARG MANTLE_BUILD_TIME=""
ENV MANTLE_GIT_SHA=$MANTLE_GIT_SHA
ENV MANTLE_BUILD_TIME=$MANTLE_BUILD_TIME
RUN pnpm -C client/web build && rm -rf client/web/.next/cache
EXPOSE 3000
CMD ["pnpm", "-C", "client/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
