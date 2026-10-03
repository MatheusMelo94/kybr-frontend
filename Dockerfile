# syntax=docker/dockerfile:1
# Portable container build (frontend-devops-conventions.md § Dockerfile
# Baseline). Vercel is the host (ADR-0005). This image is the fallback that
# keeps a move to a Docker PaaS cheap; CI builds it and checks its health on
# every push. Nothing deploys it.
#
# Runtime env is required (lib/env.ts validates it at boot and exits on a bad
# value). On any non-Vercel host, CLIENT_IP_HEADER must be chosen for that
# host's proxy chain and proven with a spoof test first (threat model F02).

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholders for the build-time env check only (next.config.ts). They aren't
# secrets and aren't kept: every value is read again at runtime, so the real
# API_BFF_KEY is never a build arg (threat model F09). There are no
# NEXT_PUBLIC_* variables to bake in.
RUN API_BASE_URL=https://api.example.invalid \
    API_PUBLIC_BASE_URL=https://api.example.invalid \
    API_BFF_KEY=docker-build-placeholder-not-a-secret \
    CLIENT_IP_HEADER=x-forwarded-for \
    CLIENT_IP_TRUSTED_HOPS=1 \
    pnpm build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# The standalone server and the static assets only. There is no public/ yet.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://localhost:${PORT}/api/health" || exit 1
CMD ["node", "server.js"]
