# ProductPort web image (Next.js). Mirrors the fleet (clinicport/opsport) web
# image. Listens on 3000 — the fleet web container_port.
FROM node:22-alpine
WORKDIR /app

# Auth for @matthewdbaldwin/microport-ui from GitHub Packages.
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}

COPY package*.json .npmrc ./
RUN npm ci

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
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}

# Sentry environment label. Defaults to production; deploy-dev.yml overrides to
# "development" so dev events don't pollute the prod issue stream. Baked at build
# time for the browser bundle (NEXT_PUBLIC_) and carried to runtime for the
# server/edge configs (SENTRY_ENVIRONMENT).
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}
ENV SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}

RUN npm run build
RUN npm prune --omit=dev

# Runtime Sentry DSN (Node.js server runtime — separate var name from
# the browser-side NEXT_PUBLIC). Baked into the image so no ECS task-def
# update needed.
ENV SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
