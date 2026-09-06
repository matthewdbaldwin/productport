# ProductPort web image (Next.js). Mirrors the fleet (clinicport/opsport) web
# image. Listens on 3000 — the fleet web container_port.
FROM node:22-alpine
WORKDIR /app

# Auth for @matthewdbaldwin/microport-ui from GitHub Packages.
# Delivered as a BuildKit secret mount, never as ARG/ENV: an ARG value is
# recorded in `docker history`, and an ENV persists into the shipped image's
# config -- i.e. into the running container's environment. 2026-09-06.
COPY package*.json .npmrc ./
RUN --mount=type=secret,id=npm_token,required=true \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci

COPY . .
RUN rm -f next.config.ts

# Same-task API base for the Next.js server (proxy/SSR). The api container shares
# the task's network namespace, so localhost:<api port>.
ARG API_URL
ENV API_URL=${API_URL}

# Sentry build-time vars.
# NEXT_PUBLIC_SENTRY_DSN is baked into the browser bundle by next build.
# SENTRY_AUTH_TOKEN authorises source-map upload during the same build.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
# Sentry environment label. Defaults to production; deploy-dev.yml overrides to
# "development" so dev events don't pollute the prod issue stream. Baked at build
# time for the browser bundle (NEXT_PUBLIC_) and carried to runtime for the
# server/edge configs (SENTRY_ENVIRONMENT).
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}
ENV SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}

RUN --mount=type=secret,id=sentry_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_token 2>/dev/null || true)" npm run build
RUN npm prune --omit=dev

# Runtime Sentry DSN (Node.js server runtime — separate var name from
# the browser-side NEXT_PUBLIC). Baked into the image so no ECS task-def
# update needed.
ENV SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
