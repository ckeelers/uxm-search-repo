# searchexperience

A focused job search for UX Manager roles, sourced only from company career
pages. See [`specs/product-spec.md`](specs/product-spec.md) and
[`plans/implementation-plan.md`](plans/implementation-plan.md).

## Layout

```
apps/web       Next.js app — search, saved jobs, /admin
apps/worker    crawl runner — runs on a schedule, writes the job index
packages/core  shared logic (taxonomy, salary, location) + Prisma client + types
```

## Prerequisites

- Node 22+ (`.nvmrc` pins 22)
- pnpm 9 — `npm install -g pnpm@9` if you don't have it

## Local setup

```bash
pnpm install
cp .env.example .env          # then set DATABASE_URL to a local Postgres
pnpm db:generate              # generate the Prisma client
pnpm db:migrate               # create/apply the local database schema
pnpm dev:web                  # http://localhost:3000  (health: /api/health)
pnpm crawl                    # run the worker once
```

No local Postgres? The fastest path is a free Railway Postgres (below) — point
`DATABASE_URL` at it and run `pnpm db:migrate` against it.

## Scripts (repo root)

| Command | Does |
|---|---|
| `pnpm build` | build every package |
| `pnpm typecheck` | typecheck every package |
| `pnpm test` | run `packages/core` unit tests (Vitest) |
| `pnpm dev:web` / `pnpm dev:worker` | run one app in watch mode |
| `pnpm crawl` | run the crawl worker once |
| `pnpm db:generate` / `db:migrate` / `db:deploy` / `db:studio` | Prisma |

## Deploy (Railway)

One Railway project, three parts: a Postgres database and two services from
this repo.

1. **Create the project** and add a **PostgreSQL** database.
2. **`web` service** — deploy from this repo.
   - Root directory: repo root
   - Build: `pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @searchexperience/web build`
   - Start: `pnpm --filter @searchexperience/web start`
   - Pre-deploy / release command: `pnpm db:deploy` (applies migrations)
   - Variables: `DATABASE_URL` (reference the Postgres plugin), `ADMIN_USER`, `ADMIN_PASS`, `NODE_ENV=production`
3. **`worker` service** — deploy from the same repo.
   - Root directory: repo root
   - Build: `pnpm install --frozen-lockfile && pnpm db:generate`
   - Start: `pnpm --filter @searchexperience/worker start`
   - **Cron Schedule:** `0 8 * * *`
   - Variables: `DATABASE_URL`, `CRAWL_MAX_RUNTIME_MS`, `CLOSE_AFTER_MISSED_CRAWLS`, `CRAWL_USER_AGENT`, `NODE_ENV=production`
4. **Set a usage cap** on the project ($10–15) — plan §5.5.

Verify: open the `web` URL, then `/<web-url>/api/health` should return
`{"status":"ok","db":"ok"}`.

## Seeding and crawling

The crawler only visits companies in the `Company` table. Populate it once, then
run a crawl (the cron does this daily; run it by hand the first time):

```bash
# with the Railway CLI, against the deployed database:
railway run --service worker pnpm --filter @searchexperience/worker seed
railway run --service worker pnpm --filter @searchexperience/worker crawl
```

`seed` is idempotent. After the first `crawl`, open the `web` URL — indexed
roles appear on the home page.

