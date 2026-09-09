# searchexperience

A focused job search for UX Manager roles, sourced only from company career
pages. See [`specs/product-spec.md`](specs/product-spec.md) and
[`plans/implementation-plan.md`](plans/implementation-plan.md).

## Layout

```
apps/web       Next.js app — search, saved jobs, /admin
apps/worker    crawl runner — 5 min job on a schedule, writes the job index
packages/core  shared logic (taxonomy, salary, location) + Prisma client + types
```

Job sources: **Greenhouse, Lever, Ashby, Workday** — one adapter per platform in
`apps/worker/src/adapters/`, all pure JSON APIs. ~57 companies seeded.

## Prerequisites

- Node 22+ (`.nvmrc` pins 22)
- pnpm 9 — `npm install -g pnpm@9`

## Local setup

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL to a Postgres you can reach
pnpm db:generate
pnpm db:migrate               # create/apply the schema
pnpm dev:web                  # http://localhost:3000  (health: /api/health)
pnpm crawl                    # run the crawler once
pnpm test                     # core unit tests
```

No local Postgres? Point `DATABASE_URL` at your Railway Postgres'
`DATABASE_PUBLIC_URL` (Railway → Postgres → Variables) and run `pnpm db:migrate`
against it. A gitignored `packages/core/prisma/.env` with just that one line is
picked up automatically.

## Scripts (repo root)

| Command | Does |
|---|---|
| `pnpm build` / `pnpm typecheck` | all packages |
| `pnpm test` | `packages/core` unit tests (Vitest) |
| `pnpm dev:web` / `pnpm dev:worker` | one app in watch mode |
| `pnpm crawl` / `pnpm --filter @searchexperience/worker seed` | run / seed the crawler |
| `pnpm db:generate` / `db:migrate` / `db:deploy` / `db:studio` | Prisma |

## Deploy (Railway)

One project: a **PostgreSQL** database + two services from this repo, `web` and
`worker` (connect the same repo twice).

| | `web` | `worker` |
|---|---|---|
| Root directory | repo root | repo root |
| Build | `pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @searchexperience/web build` | `pnpm install --frozen-lockfile && pnpm db:generate` |
| Pre-Deploy | `pnpm db:deploy` | — |
| Start | `pnpm --filter @searchexperience/web start` | `pnpm --filter @searchexperience/worker start` |
| Cron Schedule | — | `0 8 * * *` |
| Variables | `DATABASE_URL` (`${{Postgres.DATABASE_URL}}`), `ADMIN_USER`, `ADMIN_PASS`, `NODE_ENV=production` | `DATABASE_URL`, `CRAWL_MAX_RUNTIME_MS`, `CLOSE_AFTER_STALE_HOURS`, `CRAWL_USER_AGENT`, `NODE_ENV=production` |

**Cron cadence:** the crawler is cadence-agnostic — a job closes `CLOSE_AFTER_STALE_HOURS` (default 36) after it was last seen, not after N missed runs, and a run still going is skipped rather than stacked. Anything from twice a day to every ~15 min is safe; sub-hourly just adds request volume to the job sites for little gain. Current schedule: `0 10,22 * * *` (10:00 / 22:00 UTC ≈ 6am / 6pm US Eastern). Railway cron is UTC and does not follow daylight saving.

Set a project **usage cap** ($10–15). Verify with `/<web-url>/api/health` →
`{"status":"ok","db":"ok"}`.

## Seeding and crawling in production

The crawler only visits companies in the `Company` table. `worker` is a cron
service (no persistent container), so run one-offs **inside the `web`
container**, where the internal `DATABASE_URL` resolves:

```bash
railway ssh --service <web service name>
cd /app
pnpm --filter @searchexperience/worker seed    # idempotent — the 57-company list
pnpm --filter @searchexperience/worker crawl   # one full pass (~3 min)
exit
```

After that the nightly cron keeps it fresh. A re-crawl re-classifies every
stored row (useful after a taxonomy / parser change); the live pages may need a
refresh to catch up.

## Adding a company

Easiest: **`/admin/companies`** (HTTP basic auth, `ADMIN_USER` / `ADMIN_PASS`) —
add a row with its platform + board token, then run a crawl.

`platformId` (the "token") by platform:

| Platform | Token | Example |
|---|---|---|
| Greenhouse | board token | `stripe` (from `boards.greenhouse.io/stripe`) |
| Lever | company slug | `spotify` (from `jobs.lever.co/spotify`) |
| Ashby | board name | `notion` (from `jobs.ashbyhq.com/notion`) |
| Workday | `<tenant>/<wd>/<site>` | `adobe/wd5/external_experienced` (from `adobe.wd5.myworkdayjobs.com/external_experienced`) |

To seed permanently instead, add it to `apps/worker/src/seed-companies.ts`.

## `/admin`

| Page | For |
|---|---|
| `/admin/review` | borderline titles — approve as Design / Research, or reject |
| `/admin/rejected` | every rejected role grouped by reason — sanity-check the taxonomy; `→ review` reopens a false reject |
| `/admin/companies` | add / pause / exclude / delete companies |
| `/admin/crawls` | last crawl summary + per-company run log with errors |
