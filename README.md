# ProductPort

Welcome to **ProductPort** — the product-catalog satellite and the system of record for MicroPort's product descriptive data, regulatory-clearance matrix, and clinical-evidence library. Every authenticated employee can browse the catalog (ProductPort is a universal-viewer app: SSO grants `viewer` to everyone, an explicit `product_admin` grant unlocks editing, and any explicit grant surfaces the tile in the AppSwitcher — see [Roles](#roles) for the fine print on `product`). Product, market-access, and regulatory teams use it as the single source of truth for what a product is, where it is cleared, and the trials behind it.

For the full platform overview — how this satellite relates to the other six and to the shared `microport-ui` library — see [Plato](https://github.com/matthewdbaldwin/salesport/blob/main/docs/PLATO.md).

## What this satellite does

- **Product catalog** — descriptive fields, taglines, indications, specs, and imagery per product, organised by subsidiary and therapeutic area
- **Regulatory-clearance matrix** — per-region clearance status (CE / FDA / NMPA / PMDA) with notes
- **Clinical-evidence library** — trials linked to each product (identifier, design, N, result)
- **Universal SSO viewer** — every employee sees the catalog; a `product_admin` grant unlocks editing and the regulatory/taxonomy surfaces (`product` is reserved and gates nothing yet — see [Roles](#roles))
- **Canonical deep-links** — every product has a stable, shareable URL (`?product=<slug>`) so the hub and other satellites can link straight to it
- **In-memory catalog** — the whole (small) catalog loads once; search, filter, and detail are all client-side for instant interaction

## Roles

Roles and account status are managed in HubPort (Employees page); ProductPort has no local user-management surface by design. What each role actually does today:

| Role | How it's assigned | What it does today |
|---|---|---|
| `viewer` | Automatic — every authenticated employee | Read-only catalog. No grant needed, so it is never offered in the grant picker. |
| `product` | HubPort grant | ⚠ **Reserved for upcoming product-management features; currently equivalent to `viewer`.** No route guard differentiates it — `requireProductAdmin` is the only write gate — so granting it changes nothing except surfacing the ProductPort tile in the grantee's app-switcher. It stays grantable so the planned two-tier editor (descriptive fields + trials + images) can land without a re-grant wave, and it is deliberately de-advertised from `GET /api/auth/role-catalog` until that gate ships. |
| `product_admin` | HubPort grant | Full editor: catalog writes, CSV import/export, regulatory-clearance matrix, taxonomy, product disable/enable. |
| `superuser` | Local elevation only — never SSO-granted | `product_admin` powers; preserved across logins by `preserveLocalElevation` so the JIT sync never demotes it. |

## Where it lives

- **Production:** `https://product.microport.com` (AWS ECS in `eu-central-1`, cluster `microport`, service `productport`)
- **Development:** AWS ECS Fargate dev mesh (cluster `microport-dev`, service `productport-dev`), auto-deployed from the `develop` branch via `deploy-dev.yml`
- **Repository:** `https://github.com/matthewdbaldwin/productport`
- **Releases:** [github.com/matthewdbaldwin/productport/releases](https://github.com/matthewdbaldwin/productport/releases) — version history with the why behind each ship

## Architecture

Two tiers, deployed as two containers behind the shared ALB:

- **API** — Express + Prisma 7 (adapter-pg), port `4006`. Owns the catalog master data and the SSO/JIT auth boundary. ProductPort is the system of record for product data; `MDMcode` is the (later) mesh join key minted by SalesPort.
- **Web** — Next.js (App Router), dev port `3100`. A single client catalog page that loads the active catalog once and does all search / filter / detail in memory.

## Local development

```bash
git clone https://github.com/matthewdbaldwin/productport
cd productport
cp .env.example .env               # fill in DATABASE_URL, SALESPORT_JWT_PUBLIC_KEY, etc.
npm install                        # api tier (Express + Prisma, port 4006)
cd web && npm install              # web tier (Next.js, port 3100)
cd .. && npx prisma migrate dev    # apply migrations to local Postgres
npm run seed                       # optional: seed the sample catalog
npm run dev                        # API on :4006
cd web && npm run dev              # Web on :3100
```

Auth goes through SalesPort SSO — a local instance needs `SALESPORT_JWT_PUBLIC_KEY` (+ issuer) so it can verify handoff tokens, and `SALESPORT_API_URL` pointing at a running SalesPort (locally or the dev mesh). Installing `@matthewdbaldwin/*` packages requires `NODE_AUTH_TOKEN` (a GitHub Packages PAT).

## Key environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`app_runtime` in prod) |
| `SALESPORT_JWT_PUBLIC_KEY` | Public key used to verify SalesPort SSO handoff tokens |
| `SALESPORT_JWT_ISSUER` | Expected issuer claim on SSO tokens |
| `JWT_SECRET` | Signing secret for local session tokens |
| `SSO_CLAIMS_MODE` | How SSO claims are read / verified |
| `COOKIE_DOMAIN` | Session cookie domain (`.microport.com` in prod) |
| `SALESPORT_API_URL` | SalesPort API base URL (SSO + audit) |
| `SALESPORT_WEB_URL` | SalesPort hub web URL (SSO round-trip origin) |
| `SALESPORT_LIFECYCLE_SECRET` | HMAC secret for inbound SalesPort → ProductPort SSO-lifecycle webhooks (`/api/sso/lifecycle`) |
| `ALLOW_UNSIGNED_LIFECYCLE` | Dev-only: skip lifecycle HMAC when no secret is provisioned (guard fails closed otherwise) |
| `WEBHOOK_SECRET_PRODUCTPORT_SALESPORT` | HMAC secret for outbound ProductPort → SalesPort events (e.g. bug reports) |
| `OPSPORT_API_KEY` | Static bearer key for the inbound OpsPort seam (`GET /api/opsport/*`: catalog search + live clearance reads) |
| `REVIEWPORT_API_KEY` | Static bearer key for the inbound ReviewPort seam (`GET /api/reviewport/*`: product search + detail for ReviewPort's "Add from ProductPort" picker; read-only, same guard as OpsPort, separate key) |
| `WEB_ORIGIN` | Own public web origin (CORS + canonical links) |
| `PORT` | API listen port (`4006` locally) |
| `NODE_AUTH_TOKEN` | GitHub Packages PAT — required to install `@matthewdbaldwin/*` |

> Note: the SalesPort hub also needs `PRODUCTPORT_WEB_URL` (+ `PRODUCTPORT_API_URL`) set so the SSO handoff `returnTo` validates against ProductPort.

## SSO lifecycle

ProductPort is SSO/JIT: on every login the auth middleware re-resolves the user's role from the SSO claim and upserts the local `User` row. The inbound receiver (`POST /api/sso/lifecycle/event`, HMAC-verified via `createLifecycleGuard`) validates events against `microport-contracts` `LifecycleEvent` and acts on the account flag — `disable` deactivates the user (so an offboarded account loses access before its token expires), `reactivate` re-enables it. A `grant`/`reactivate` for an email with **no local row creates it** (fleet create-on-grant decision, 2026-08-19) when the event's role maps — placeholder name from the email local-part; the real name and role re-sync from the SSO claim at first login. For existing rows, `grant` / `revoke` write no role here; the role takes effect on the next login. A sibling `POST /api/sso/lifecycle/state` answers SalesPort's hourly reconciliation probe. Every event is logged to `UserLifecycleEvent` (audit + `X-Lifecycle-Event-Id` dedup).

## Ship discipline

This satellite follows the platform's standard `Mig → Lang → Ship → Hunt → Watch` deploy chain — see [Plato](https://github.com/matthewdbaldwin/salesport/blob/main/docs/PLATO.md#deploy-chain--the-daily-flow). `develop` is the testing branch (deployed to the AWS ECS Fargate dev mesh via `deploy-dev.yml`); `main` is what runs in production. Features stay on `develop` until verified, then `develop-to-main` is dispatched. Note: prod builds two images (api + web); version bumps must be surgical (commit the lockfile alongside `package.json`, never `npm install` to regenerate it).
