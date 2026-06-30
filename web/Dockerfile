# ProductPort web image (Next.js). Mirrors the fleet (clinicport) web image,
# minus Sentry (not wired yet). Listens on 3000 — the fleet web container_port.
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

RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
