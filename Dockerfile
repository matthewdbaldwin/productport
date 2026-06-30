# ProductPort API image. Multi-stage; runtime is prod-only deps.
# feedback_runtime_dep_not_devdep, feedback_prisma_cli_stays_in_dependencies,
# feedback_prisma_config_mjs_not_ts. Mirrors the fleet (clinicport) api image.

FROM node:22-alpine AS backend-deps
WORKDIR /app
# GitHub Packages auth for @matthewdbaldwin/* deps. Scoped to this build stage.
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN}
COPY package*.json .npmrc ./
COPY prisma.config.mjs ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=backend-deps /app/node_modules ./node_modules
COPY prisma.config.mjs ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY package.json ./
# eu-central-1 RDS CA bundle — db.js + db-migrate.js require verified TLS and
# default to /app/rds-ca-eu-central-1.pem. feedback_prisma_adapter_pg_ssl.
COPY rds-ca-eu-central-1.pem ./rds-ca-eu-central-1.pem

EXPOSE 4006
# Migrate on boot, then serve. Migrations are idempotent (IF NOT EXISTS) because
# adapter-pg runs them non-transactionally. feedback_prisma7_non_transactional_migrations.
CMD ["sh", "-c", "node scripts/db-migrate.js && node src/server.js"]
