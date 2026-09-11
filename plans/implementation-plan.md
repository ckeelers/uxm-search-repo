# Implementation Plan: searchexperience

> **Status:** Approved — Gate 2 of 3 passed
> **Phase:** Implementation (Gate 3) — M0–M2 done, M3 (MVP) in progress
> **Spec:** [`specs/product-spec.md`](../specs/product-spec.md) (approved 2026-09-06)
> **Last updated:** 2026-09-08

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language front to back; closest to the portfolio's React/TS. |
| Web app | Next.js (App Router) | Search UI, saved jobs, and a small internal `/admin` in one deploy. |
| ORM / DB | Prisma + PostgreSQL (Railway managed) | Typed queries, migrations, one managed database. |
| Crawler | Separate Node/TS worker service | Long scrape jobs don't belong in a web request; run on a schedule. |
| Shared logic | `packages/core` | Title taxonomy, salary parser, location classifier, Prisma client, types — used by **both** web and worker, tested in one place. |
| Styling | Tailwind CSS, mobile-first | Matches the portfolio; no component library needed for v1. |
| Tests | Vitest, in `packages/core` | The taxonomy / salary / location logic is the highest correctness risk — that's what gets tested. |
| Auth (v1) | None for the public site. `/admin` behind HTTP basic auth (env vars). Saved jobs use a hardcoded `userId = "owner"`. | Spec: v1 is single-user, no accounts. |

---

## 2. Repo layout (pnpm workspaces monorepo)

```
searchexperience/
  apps/
    web/                Next.js app — search, saved, admin
    worker/             crawl runner — cron entrypoint + per-platform adapters
  packages/
    core/
      prisma/schema.prisma
      src/
        db.ts           Prisma client singleton
        taxonomy.ts     normalizeTitle, matchTitle (Stage 1), contentCheck (Stage 2)
        salary.ts       parseCompensation -> annualized USD min/max/midpoint
        location.ts     classifyLocation -> arrangement + remote scope/states
        types.ts
      src/*.test.ts
  specs/
  plans/
```

Plain pnpm workspaces (no Turborepo for v1 — revisit if builds get slow).

---

## 3. Data model (Prisma)

```prisma
enum Platform        { GREENHOUSE  LEVER  ASHBY  WORKDAY  GENERIC }
enum Track           { UX_DESIGN_MGR }   // research track removed 2026-09-08; kept for future role types
enum MatchOutcome    { STAGE1_INCLUDE  STAGE2_INCLUDE  REVIEW_QUEUE  REJECTED }
enum SiteArrangement { ONSITE  HYBRID  UNKNOWN }   // in-office expectation for a physical worksite
enum RemoteScope     { ANYWHERE_US  STATE_LIST }
enum SalaryState     { STATED  UNKNOWN }
enum JobStatus       { OPEN  CLOSED }
enum SavedStatus     { SAVED  APPLIED }

model Company {
  id         String     @id @default(cuid())
  name       String
  slug       String     @unique
  platform   Platform
  platformId String?    // e.g. Greenhouse board token "stripe"
  careersUrl String
  active     Boolean    @default(true)
  excluded   Boolean    @default(false)  // current employer / conflict — never crawl, never surface
  notes      String?
  createdAt  DateTime   @default(now())
  jobs       Job[]
  crawlRuns  CrawlRun[]
}

model Job {
  id              String          @id @default(cuid())
  company         Company         @relation(fields: [companyId], references: [id])
  companyId       String
  externalId      String          // platform's job id
  sourceUrl       String          // direct apply link on the company's page

  rawTitle        String
  normalizedTitle String
  track           Track?          // null while REVIEW_QUEUE / REJECTED
  matchOutcome    MatchOutcome
  matchReason     String?         // why rejected, or why borderline

  descriptionText String          @db.Text

  // --- location: a job can be BOTH sited in one or more states AND US-remote at once ---
  siteStates      String[]        // 2-letter worksite states, e.g. ["CO","NY","CA"]; empty if purely remote
  siteArrangement SiteArrangement? // ONSITE | HYBRID | UNKNOWN — in-office expectation for those sites
  remoteUs        Boolean         @default(false)  // a US-remote option is offered
  remoteScope     RemoteScope?    // only when remoteUs = true
  remoteStates    String[]        // 2-letter list when remoteScope = STATE_LIST
  rawLocationText String?         // original location string, always kept

  salaryState     SalaryState
  salaryMin       Int?            // annualized USD
  salaryMax       Int?
  salaryMidpoint  Int?
  compRawText     String?

  datePosted      DateTime?       // from the posting, if stated
  firstSeen       DateTime        @default(now())
  lastVerified    DateTime        @default(now())
  status          JobStatus       @default(OPEN)
  missedCrawls    Int             @default(0)
  closedAt        DateTime?

  savedJobs       SavedJob[]

  @@unique([companyId, externalId])
  @@index([status, track])
  @@index([datePosted])
}

model SavedJob {
  id        String      @id @default(cuid())
  job       Job         @relation(fields: [jobId], references: [id])
  jobId     String
  userId    String      @default("owner")
  status    SavedStatus @default(SAVED)
  notes     String?
  savedAt   DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@unique([jobId, userId])
}

model CrawlRun {
  id         String    @id @default(cuid())
  company    Company?  @relation(fields: [companyId], references: [id])
  companyId  String?
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  jobsSeen   Int       @default(0)
  jobsNew    Int       @default(0)
  jobsClosed Int       @default(0)
  errorText  String?
}
```

Notes:
- **Rejected jobs are stored** (`matchOutcome = REJECTED`, `matchReason` set) from M1 on — cheap, and the only way to tune the taxonomy against real data.
- An unseen job flips to `CLOSED` once it has gone unseen for **`CLOSE_AFTER_STALE_HOURS`** (default 36) — a wall-clock rule, not a miss count, so it behaves the same at any cadence.
- **Excluded companies** (`excluded = true`) are skipped by the crawler entirely and never appear in results. **Amazon is excluded** (the builder's current employer). `/admin/companies` shows excluded rows greyed so one isn't re-added by accident.
- **Location is two independent facets, not one enum.** A posting can be sited in several states *and* offer US-remote at the same time (real: Gusto lists 3 hybrid offices; Pinterest lists "San Francisco, CA, US; Remote, US"). Hence `siteStates String[]` + `siteArrangement` for the physical side, and `remoteUs` / `remoteScope` / `remoteStates` for the remote side. `siteStates` needs a **GIN index** for `= ANY(...)` state filtering; add `@@index([status, siteArrangement])` too.

---

## 4. Domain logic (`packages/core`)

### 4.1 `taxonomy.ts`
- `normalizeTitle(raw): string` — lowercase, collapse punctuation, strip seniority/scope modifiers (`senior`, `sr`, `lead`, `group`, `staff`, `principal`), strip location / org / req-id suffixes, un-invert comma forms.
- `matchTitle(normalized): { outcome: 'STAGE1_INCLUDE' | 'REVIEW_QUEUE' | 'REJECTED', track?, reason? }`
  1. Disqualifier hit without a design/UX qualifier → `REJECTED`.
  2. Discipline token **and** leadership token present → `STAGE1_INCLUDE` + `track`.
  3. Borderline pattern (`design manager` with no UX/product qualifier, `ux product manager`) → `REVIEW_QUEUE`.
  4. Else → `REJECTED`.
- `contentCheck(descriptionText): { score: number, decision: 'auto-include' | 'review' | 'reject' }` — Stage 2, scans for corroborating vs anti-signal phrases (lists from the spec).
- Exported constants: `DISQUALIFIERS`, `DISCIPLINE_TOKENS`, `LEADERSHIP_TOKENS`, `BORDERLINE_PATTERNS`, `CORROBORATING_SIGNALS`, `ANTI_SIGNALS`.

### 4.2 `salary.ts`
- `parseCompensation(text): { state, min?, max?, midpoint?, raw }`
- Handles `$150,000–$180,000`, `$272,000 to $306,000`, `150k-180k`, single value, bare consecutive figures split across markup, `$72/hr` (×2080), `$12,500/mo` (×12); **postings with multiple bands** (real: Gusto lists two zone bands in one posting) → extract all, take the **lowest**; non-USD → `UNKNOWN`; sanity bounds $30k–$1M else `UNKNOWN`. (Formats confirmed against live Greenhouse data — see [`m1-seed-companies.md`](./m1-seed-companies.md).)
- `midpoint = round((min + max) / 2)`, or the single value.
- Pipeline rule: `STATED` and `midpoint < 150_000` → drop (store as `REJECTED`, reason `below-threshold`). `UNKNOWN` → keep.

### 4.3 `location.ts`
```ts
classifyLocation(rawLocationText: string, descriptionText: string): {
  isUsBased: boolean;          // false -> caller drops the job (spec: US-based only)
  siteStates: string[];        // 2-letter worksite states (may be several; empty if purely remote)
  siteArrangement: 'ONSITE' | 'HYBRID' | 'UNKNOWN';
  remoteUs: boolean;           // a US-remote option is offered
  remoteScope?: 'ANYWHERE_US' | 'STATE_LIST';
  remoteStates?: string[];     // when STATE_LIST
}
```
- A single posting can be **both** sited and remote — so the result carries the site facet and the remote facet independently, not one `arrangement` enum.
- **Parsing:** split `rawLocationText` on `;` into parts (real values are semicolon-delimited multi-location with embedded arrangement words, e.g. `"Denver, CO - Hybrid; New York, New York, United States; San Francisco, CA - Hybrid"`). For each part:
  - `remote` keyword → set `remoteUs = true`; otherwise add its state to `siteStates`.
  - `hybrid` / `onsite` keyword → contributes to `siteArrangement` (HYBRID wins over ONSITE if parts disagree; UNKNOWN if no part says).
  - extract the state: 2-letter code, full state name (`"New York, New York"`), or metro→state map (`"San Francisco Bay Area"` → CA).
- **Remote scope:** if `remoteUs`, scan `descriptionText` for `"must reside in" / "open to residents of X, Y" / "cannot hire in ..."` → `STATE_LIST` (+ `remoteStates`), else `ANYWHERE_US`.
- **US check:** any non-US location with no US part → `isUsBased = false`.
- Real `rawLocationText` samples are in [`m1-seed-companies.md`](./m1-seed-companies.md) and seed the Vitest suite.

Each of the three modules ships with a Vitest suite covering the spec's worked examples before it's wired into the pipeline.

---

## 5. Crawler (`apps/worker`)

### 5.1 Adapter interface
```ts
interface Adapter {
  platform: Platform;
  listJobs(company: Company): Promise<RawJob[]>;
}
type RawJob = {
  externalId: string;
  url: string;
  title: string;
  descriptionText: string;
  locationText?: string;
  compText?: string;
  datePosted?: Date;
};
```

### 5.2 Adapters (one per platform — many companies each)
| Adapter | Source | Milestone |
|---|---|---|
| `greenhouse` | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (JSON — the company's own board). Field mapping + real-data quirks verified 2026-09-06, see [`m1-seed-companies.md`](./m1-seed-companies.md). `datePosted` ← `first_published`; `sourceUrl` ← `absolute_url` (host varies per company, pass through). | M1 |
| `lever` | `GET https://api.lever.co/v0/postings/{company}?mode=json` | M4 |
| `ashby` | `POST https://api.ashbyhq.com/posting-api/job-board/{name}` | M4 |
| `workday` | per-tenant `POST /wday/cxs/{tenant}/{site}/jobs`; Playwright fallback (needs a Dockerfile for browser deps) | M4 |
| `generic` | cheerio + heuristics; lowest priority | later |

All requests use a polite `CRAWL_USER_AGENT` (identifies the project + a contact) and a conservative rate limit.

### 5.3 Pipeline (`src/crawl.ts`) — idempotent, re-runnable
```
for each Company where active = true and excluded = false:
  open CrawlRun
  raw = adapter.listJobs(company)
  seen = []
  for each r in raw:
    loc = classifyLocation(r.locationText, r.descriptionText)
    if not loc.isUsBased                        -> skip
    normalized = normalizeTitle(r.title)
    m = matchTitle(normalized)
    if m.outcome == REJECTED                    -> upsert Job(REJECTED, reason); continue
    if m.outcome == REVIEW_QUEUE:
       c = contentCheck(r.descriptionText)
       outcome = c.decision == 'auto-include' ? STAGE2_INCLUDE
               : c.decision == 'reject'       ? REJECTED
               :                                 REVIEW_QUEUE
    comp = parseCompensation(r.compText ?? r.descriptionText)
    if comp.state == STATED and comp.midpoint < 150000 -> upsert Job(REJECTED, 'below-threshold'); continue
    upsert Job by (companyId, externalId)  [writing loc.siteStates / loc.siteArrangement / loc.remoteUs / loc.remoteScope / loc.remoteStates]:
       create -> firstSeen=now, lastVerified=now, datePosted=r.datePosted, missedCrawls=0, status=OPEN
       update -> lastVerified=now, missedCrawls=0, refresh mutable fields, keep firstSeen
    seen.push(externalId)
  # reconcile — ONLY when the fetch succeeded
  if adapter fetch returned a 403 / 429 / bot-challenge or threw:
     record CrawlRun.errorText, leave every existing Job untouched (no missedCrawls bump), move to next company
  else:
     for each Job where companyId, status=OPEN, externalId NOT IN seen:
        missedCrawls++ ; if now - lastVerified >= CLOSE_AFTER_STALE_HOURS -> status=CLOSED, closedAt=now
  close CrawlRun (counts)
```

A block therefore degrades one company's data freshness (its jobs stop refreshing, `lastVerified` stops advancing) but never wrongly closes them — the operator has days to react via `/admin`.

### 5.4 Schedule
Railway cron on the `worker` service. Entry point `pnpm --filter @searchexperience/worker start`, which runs `src/crawl.ts` via **tsx**. **Cadence-agnostic** — currently `0 10,22 * * *` (10:00 / 22:00 UTC ≈ 6am / 6pm US Eastern; Railway cron is UTC, no DST). Anything twice-daily → ~15 min is safe (see 5.5).

### 5.5 Runaway-cost & concurrency guards
The cron service only bills while the script runs. Defenses, most important first:
- **In-script timeouts** — a global run cap (`CRAWL_MAX_RUNTIME_MS`, default **10 min** — a run can't outlive this), plus a per-HTTP-request cap (~15 s via `AbortController`).
- **No overlapping runs** — on startup the crawler checks for a `CrawlRun` still `finishedAt = null` and younger than 12 min; if found, it logs and exits without doing anything.
- **Railway usage cap** — a hard spending limit ($10–15) set in the Railway dashboard; if anything exceeds it Railway stops the services, so worst case is bounded.
- **Small footprint** — the worker needs minimal RAM until Playwright (M4); Playwright adapters get tighter timeouts and can run on a slower cadence.

---

## 6. Web app (`apps/web`)

| Route | Purpose |
|---|---|
| `/` | Search. Reads filter state from URL params (`track`, `arr[]` ⊆ {onsite,hybrid,remote}, `state`, `salary`, `q`), queries Prisma for `status=OPEN` + included jobs, renders cards. Sort: `datePosted` desc (nulls last), then `firstSeen` desc. **Arrangement filter → SQL:** `onsite` checked → `siteArrangement = ONSITE (AND :state = ANY(siteStates) if state set)`; `hybrid` checked → same with `HYBRID`; `remote` checked → `remoteUs = true` (state ignored per spec). The checked clauses are OR'd. With no state set, the `siteStates` condition is dropped. (`siteStates` gets a Postgres GIN index for `= ANY(...)`.) |
| `/saved` | `SavedJob` for `userId="owner"`, grouped SAVED / APPLIED, inline status control + notes + remove. `CLOSED` jobs show a **"No longer listed"** tag. Server actions for mutations. |
| `/jobs/[id]` | Full detail (added M4; cards carry enough for MVP). |
| `/admin/review` | `matchOutcome = REVIEW_QUEUE` queue — approve (set `track`, `STAGE2_INCLUDE`) or reject. |
| `/admin/companies` | CRUD companies (name, slug, platform, platformId, careersUrl, active). |
| `/admin/crawls` | Recent `CrawlRun` rows + errors. |
| `middleware.ts` | HTTP basic auth on `/admin/*` via `ADMIN_USER` / `ADMIN_PASS`. |

**Job card:** title · company · track badge · location tags — one per `siteStates` entry with the `siteArrangement` (e.g. "Hybrid · CO, NY, CA"), plus a remote tag when `remoteUs` (`Remote: anywhere (US)` or `State requirements: …` from `remoteStates`) · comp (band as posted, or `Salary unknown / unpublished`) · `Posted {datePosted} · Seen {firstSeen} · Verified {lastVerified}` · `Apply on {company} site ↗` · Save button. A job that is both sited and remote shows both kinds of tag.

---

## 7. Environment & Railway

**Env vars:** `DATABASE_URL`, `ADMIN_USER`, `ADMIN_PASS`, `CLOSE_AFTER_STALE_HOURS` (default 12), `CRAWL_USER_AGENT`, `CRAWL_MAX_RUNTIME_MS` (default 600000).

**Railway usage cap:** set a hard spending limit ($10–15) on the project so a hung crawl or runaway service can't produce a surprise bill.

**Railway services:**
1. `web` — root `apps/web`; release step `prisma migrate deploy`; start `next start`; health route `/api/health`.
2. `worker` — root repo root; build `pnpm install --frozen-lockfile && pnpm db:generate`; Cron Schedule `0 8 * * *`; start `pnpm --filter @searchexperience/worker start` (tsx).
3. PostgreSQL plugin — shared.

---

## 8. Milestones

Each milestone is shippable and leaves the site more useful than before.

### M0 — Skeleton & deploy
- [x] pnpm monorepo (`apps/web`, `apps/worker`, `packages/core`) — `node-linker=hoisted`, workspace deps wired
- [x] Next.js 15 + Tailwind 3 app that builds; `/api/health` (liveness + DB probe)
- [x] Full Prisma schema (with the location facets) + `20260907033336_init` migration (generated offline via `migrate diff`, incl. the `siteStates` GIN index); `@searchexperience/core` exports client + types
- [x] `worker` scaffold with the runaway guard; loads core + Prisma at runtime, exits clean
- [x] Vitest wired in `packages/core` (2 wiring tests green)
- [x] typecheck + `next build` + tests all pass locally
- [x] `git init` (own repo, nested under the `Documents` repo); `.gitignore` / `.gitattributes`
- [x] GitHub repo + Railway project live: Postgres + `web` + `worker`, three services. `next` bumped to 15.5.9 (Railway CVE gate). `prisma` + `tsx` moved to `dependencies` so a production install keeps them.
- [x] **Done:** `web` live, `/api/health` → `db: ok`; `20260907033336_init` applied via `web` Pre-Deploy `pnpm db:deploy`; `worker` runs clean on Railway (`companies=0 jobs=0`).

### M1 — One source, end to end
- [x] `packages/core/taxonomy.ts`: `normalizeTitle` + Stage 1 `matchTitle` (+ `classifyTitle`); disqualifiers, above-manager-tier, wrong-function, bare-design/research → review. 16 tests green.
- [x] `apps/worker/src/adapters/greenhouse.ts` + `http.ts` (timeout, polite UA, `htmlToText`, block detection)
- [x] `apps/worker/src/crawl.ts` — real pipeline: fetch → normalize → Stage 1 → upsert (stores REJECTED too, with reason) → reconcile (skipped on a blocked fetch); `CrawlRun` rows; runaway guard
- [x] `apps/worker/src/seed-companies.ts` — the 20 companies from `m1-seed-companies.md`, idempotent (`pnpm --filter @searchexperience/worker seed`)
- [x] `/` renders OPEN + included jobs (title, company, track badge, raw location, recency dates, apply link) — dynamic, DB-backed
- [x] Dry-run against live Greenhouse (stripe/figma/gusto/doordash) — adapter + taxonomy verified; caught + fixed the "Software Engineering – Interaction Design" false-include
- [x] **Deployed + seeded + crawled** (2026-09-08): 20 companies, 3,769 postings, **12 matched** across 8 companies (Stripe, Figma, Fivetran, Lyft, Discord, DoorDash, Gusto, Pinterest), 0 errors/blocks; ~3,750 rejects stored with reasons. Web list live.
- **Note:** M1 does not filter by location/salary yet — Stripe's 2 (UK/Canada) show until M2; some dupes (Lyft, Fivetran post one role under two IDs).
- **Deploy lesson:** a transient Railway "Deploy Error" before the container starts (build green, no logs) — fixed by a plain Redeploy. Seed/first-crawl run via `railway ssh --service <web>` then `pnpm --filter @searchexperience/worker seed|crawl` (internal `DATABASE_URL` resolves there; no public proxy needed).

### M2 — The filters that matter
- [x] `packages/core/salary.ts` + 9 tests → wired into `crawl.ts` (STATED midpoint < $150k → REJECTED `below-threshold`; else store band; UNKNOWN kept). Handles ranges, `to`, k-notation, hourly ×2080, monthly ×12, multi-band → lowest, non-USD → UNKNOWN, sanity bounds, comp-cue windowing.
- [x] `packages/core/location.ts` + 11 tests → wired into `crawl.ts`. Two facets (`siteStates[]`/`siteArrangement`, `remoteUs`/`remoteScope`/`remoteStates`); `;` `•` `|` separators, embedded arrangement words, metro→state, full names + 2-letter, non-US → `isUsBased:false` → REJECTED `non-us`; remote state-list read from the description.
- [x] Facet columns + `siteStates` GIN index — already in the M0 migration, no new migration needed.
- [x] Search UI (`apps/web/app/page.tsx`): keyword, track, state, salary-state, arrangement checkboxes (default all; ≥1 → OR'd SQL per §6), all URL-driven, no-JS GET form. Cards: track badge, site tag (`Hybrid · CO, NY, CA`), remote tag, band or "Salary unknown / unpublished", recency line.
- [x] Dry-run vs live Greenhouse: 12 M1 includes → **9 keep, 3 drop** (2 Stripe non-US, 1 Lyft Toronto). All real location formats + bands parsed correctly.
- [x] **Deployed + re-crawled + verified (2026-09-08):** filters work on the live site as designed (state + arrangement, salary, track, keyword).
- **Done when:** the spec's worked examples for salary and location all produce correct result sets. ✓

### M3 — Save a job  → **MVP complete**
- [x] `apps/web/app/actions.ts` — `"use server"` actions: `saveJob` / `removeSaved` / `setSavedStatus` / `setSavedNotes`, all keyed to `OWNER_ID` (`apps/web/lib/owner.ts`, kept out of the server-actions file). `revalidatePath` on `/` and `/saved`.
- [x] Home cards get a ☆ Save / ★ Saved toggle (no-JS form action); header shows `Saved (n)` link.
- [x] `/saved` — grouped SAVED / APPLIED; per row: Apply link, status-change buttons, Remove, a notes textarea; `No longer listed` tag when `job.status = CLOSED`.
- [x] **Deployed + verified (2026-09-08):** save / remove / status / notes all work on the live site. **v1 MVP met.**
- [x] Follow-up (2026-09-08): **ARCHIVED status removed** by request — `SavedStatus` is now `{ SAVED, APPLIED }`; migration `20260908050929_drop_archived_saved_status` retargets any ARCHIVED rows to SAVED then rebuilds the enum.
- **Done when:** you can search UX Manager roles and save + revisit them. ✓ ← **v1 MVP**

### M4 — Breadth & freshness

**M4a — Lever + Ashby (deployed + crawled 2026-09-08):**
- [x] `ashby.ts` (structured salary via `summaryComponents`, multi-location join) + `lever.ts` (structured `salaryRange`, `country` → non-US); `RawJob` gains `countryHint`; both registered in `crawl.ts` ADAPTERS and the non-US check.
- [x] `seed-companies.ts` → **50 companies** — GREENHOUSE 36 / LEVER 2 / ASHBY 12, all verified live.
- [x] `location.ts` bare-city → state map (also fixes `Washington, DC` → DC).
- [x] Live: seeded + crawled, `included=10` across 50 companies.

**M4b — `/admin` (done 2026-09-08, code; deploy pending):**
- [x] `contentCheck()` in `taxonomy.ts` (corroborating vs anti-signal scan → auto-include / review / reject) + wired into `crawl.ts` for REVIEW_QUEUE titles; borderline titles now carry a best-guess `track`. 42 core tests.
- [x] `middleware.ts` — HTTP basic auth on `/admin/*` (`ADMIN_USER` / `ADMIN_PASS`).
- [x] `/admin/review` — queue with Include / Reject (server actions → `STAGE2_INCLUDE` / `REJECTED`). *(Was approve-as-Design / approve-as-Research until the research track was removed 2026-09-08.)*
- [x] `/admin/companies` — list + add + pause/resume + exclude/un-exclude + delete.
- [x] `/admin/crawls` — last 100 `CrawlRun` rows, errors highlighted.
- [ ] **Chris:** set `ADMIN_USER` / `ADMIN_PASS` on the `web` service; deploy; re-crawl to populate the queue; work it.
**M4c — Railway cron (Chris, dashboard only):** set the `worker` service's **Cron Schedule** to `0 8 * * *`. No code — the worker already runs the full pipeline and exits clean; reconciliation (`missedCrawls++` → CLOSED) and the `/saved` "No longer listed" tag are already in place and will exercise naturally once the daily crawl runs.

**M4d — `/jobs/[id]` (done 2026-09-08, code; deploy pending):**
- [x] Full detail page: title, company, track + location + salary tags, all three dates, full description, Apply + Save. Card titles on `/` and `/saved` now link to it. `notFound()` on a bad id. Typecheck + build green.

**Accuracy fix (2026-09-08, code; deploy pending):** salary & location now read the description body properly.
- [x] `salary.ts` rewritten — scans the whole posting for $-ranges, prefers ones next to a salary keyword (fixes bands being missed when "salary" appears earlier out of context), handles single labelled figures, bare-pair ranges. 11 tests.
- [x] `location.ts` — a US-remote option stated only in the description ("US hubs or remotely in the United States") now sets `remoteUs`. `htmlToText` maps en/em-dash entities. 14 tests.
- [x] Verified live: Figma "Manager, Product Design" → `[CA,NY] ONSITE + Remote(US)`, salary `$204k–$348k` (was Onsite-only / unknown).
- [x] **Deployed + re-crawled + confirmed on the live site 2026-09-08** (needed a page refresh after the crawl for the render to catch up).

**Accuracy fix 2 (2026-09-08, code; deploy pending):** onsite-only descriptions now override wrong "remote"/"hybrid" metadata.
- [x] Ashby adapter: stop trusting `isRemote` (over-broad — true even for HQ roles); use structured `address.postalAddress` for a reliable state.
- [x] `location.ts`: `saysOnsiteOnly()` — "based in our SF HQ" / "relocation assistance" + HQ / "not a remote role" etc. forces `ONSITE` + kills `remoteUs`, unless the description also explicitly offers remote. 47 core tests.
- [x] Verified live: OpenAI "Product Design Lead, Growth - Codex" → `CA · ONSITE`, remote cleared (was `Hybrid CA + Remote anywhere US`).
- [ ] **Chris:** deploy + re-crawl.

**M4e — `workday` adapter (done 2026-09-08, code; deploy pending):**
- [x] `workday.ts` — **pure JSON, no Playwright**. `platformId` = `"<tenant>/<wd>/<site>"`. Server-side `searchText` for 5 terms → dedupe → loose title pre-filter → per-job detail fetch (`GET <base><externalPath>`) for real location / date / description / pay. `http.ts` gains `postJson`. Rate-limited (200ms between searches, 250ms between details, 20 details/company cap).
- [x] `seed-companies.ts` → **57 companies / 4 platforms** (+7 WORKDAY: Adobe, NVIDIA, Salesforce, Autodesk, eBay, PayPal, Workday). `CAREERS_URL` handles the compound token.
- [x] `taxonomy.ts` — hardware/silicon terms added to `WRONG_FUNCTION` (chip design, physical design, SerDes, mixed-signal, verification, …) so NVIDIA's silicon roles auto-reject instead of flooding the review queue. 48 core tests.
- [x] Dry-run live: Adobe "Group Product Design Manager" ($223k, WA/CA), Salesforce "Experience Design Lead" ($180k), Workday "Principal AI UX Lead" ($246k) all keep; non-US + hardware correctly dropped.
- [ ] **Chris:** deploy, re-seed + re-crawl (adds ~60–90s to the crawl for the 7 Workday tenants).

FAANG-minus-Amazon custom adapters (Meta, Apple, Netflix, Google — bespoke career systems) are follow-on work; not required for a working v1.

- **Done when:** ≥40 companies across ≥3 platforms ✓ (50/3), daily auto-crawl, review queue usable.

### M5 — Polish (done 2026-09-08, code; deploy pending)
- [x] Mobile pass — `px-4 sm:px-6` on every page, header stacks on mobile, arrangement row wraps.
- [x] `app/loading.tsx` skeleton for the dynamic pages.
- [x] `/admin/rejected` — every rejected open role grouped by reason family, with counts and a `→ review` action to reopen a false reject. New "Rejected" admin tab.
- [x] `/admin/crawls` — "Last crawl" summary card (companies, seen/new/closed, errored company slugs) above the run log.
- [x] `README.md` rewritten — 4 platforms, `railway ssh` flow, per-platform token formats, "adding a company" via `/admin`.
- [x] Core tests 48 → **51**; expanding coverage caught + fixed a real bug (`Sr. Manager, User Experience Design` was rejected — `uninvertOrTrimScope` now strips leading modifiers off the pre-comma head).
- [x] **Deployed + verified 2026-09-08.**
- **Done when:** comfortable using it as your daily job search.

**Fix (2026-09-08, code; deploy pending): human verdicts are sticky.** The crawl's update path was recomputing `matchOutcome` every run, so a role rejected in `/admin/review` came back next crawl. Now a job whose `matchReason` is `admin-reject` / `admin-approve` / `admin-reopened` keeps its outcome + track across crawls; everything else (description, salary, location, `lastVerified`) still refreshes.

**Fix (2026-09-08, code; deploy pending): action buttons had no pending state.** Every server-action `<form>` (admin review/reject/reopen/company toggles, public save/status/note) now uses a shared `SubmitButton` (`app/_components/submit-button.tsx`, `useFormStatus`) that disables + shows "…" while the round-trip runs — the "had to click reject several times" symptom was queued clicks against a dead-looking button.

**Change (2026-09-08, code; deploy pending): cadence + research track.**
- Crawl is now **cadence-agnostic** (Chris set `0 10,22 * * *` — twice daily ≈ 6am/6pm ET): close is wall-clock (`CLOSE_AFTER_STALE_HOURS`, default 36), `CRAWL_MAX_RUNTIME_MS` → 10 min, and a run in progress skips rather than stacks. `CLOSE_AFTER_MISSED_CRAWLS` removed.
- **UX Research Manager track removed** by request: `Track` enum → `{ UX_DESIGN_MGR }` (migration `20260909053101_drop_research_track`); `matchTitle` rejects any research-leadership title (`reason: research-role`); the track badge, the `/` track filter, and the admin "approve as Research" button are gone. `track` field retained for future role types. Spec + plan amended.
- Home header → "Search Experience", tagline removed, **Admin** link added next to Saved.

**UI redesign (2026-09-08, code; deploy pending)** — adapted to Chris's Figma mockup:
- `next/font` (Inter body + Source Serif 4 display); `font-serif` for the wordmark and page headings.
- Shared `SiteHeader` (thin white bar: serif wordmark · Saved · Admin) across `/`, `/saved`, `/jobs/[id]`; admin gets its own header variant.
- Home: dark hero band (eyebrow "UX Manager · US only" + serif "Senior design leadership roles" + subtitle), two-column layout — left bordered filter **card** (Search / State / Salary / Arrangement pill-toggles, no-JS via `peer-checked`), right results.
- Job card: company monogram (`lib/monogram.ts`, first-2 letters), title + company, arrangement/state/remote pills, blue salary top-right, `Posted · Seen` bottom-left, ghost **Save** + solid **View job ↗** bottom-right. **Verified date moved to the results header** ("Verified {latest}"), nothing dropped from the card.
- `/saved` and `/jobs/[id]` restyled to match (monogram, pill tags, rounded cards).
- Deliberate deviations from the mockup: kept "Search Experience" (not lowercase); no Track dropdown (one role type); monogram is first-2-letters not hand-picked.
- **Styles are CSS Modules + Tailwind `@apply`** — every page/component has a sibling `.module.css` with semantic classes; JSX uses `className={styles.x}`. Global `body` styling in `globals.css` `@layer base`. Admin sub-pages now share `admin/shared.module.css`. Only literal utilities left: `submit-button`'s `disabled:opacity-50` and a few one-off layout helpers.

**Follow-up polish (2026-09-08, code; deploy pending):**
- Filter arrangement toggles: selected state via `.toggle:has(.toggleInput:checked)` (blue fill/border/text + checkmark); unselected = neutral. (Dropped the `peer` approach — combinator couldn't reach the nested checkmark.)
- **"New!" badge** before a job title on `/` and `/jobs/[id]` when `firstSeen === lastVerified` (crawl now sets both to the same instant on create); it clears on the next crawl when `lastVerified` bumps.
- Removed the "Sourced from company career pages…" hero subline.
- `/admin/review` + `/admin/rejected` given the job-card treatment (monogram, rounded card); all 4 admin sub-pages converted to CSS Modules.
- **Notes** on `/saved`: `NoteEditor` client component — an "✏️ Add notes / Edit notes" toggle line under the actions row; clicking reveals a textarea + Save/Cancel; saving returns to a static note display.
- **`/saved` split into Saved / Applied tabs** (`?tab=applied`); an Applied job shows "↩ Restore to saved" instead of "→ Applied".

**Follow-up batch 2 (2026-09-10, code; deploy pending):**
- **Admin login on load, and admin tabs showing no loading state** — same root cause: `next/link` background-prefetches a link once it's on the page. `/admin`'s prefetch request hit Basic Auth and popped the browser's login dialog before any click; the 4 admin tab links prefetched each other's data so clicks felt instant with no visible loading. Fixed by `prefetch={false}` on the `/admin` link (`site-header.tsx`) and the 4 tab links (`admin/layout.tsx`).
- **`app/admin/loading.tsx`** (new, scoped under the admin layout) — a spinner + "Loading…" in the content area only; the header/tab bar stays mounted across admin navigations.
**Follow-up batch 3 (2026-09-10, code; deploy pending): mutations weren't refreshing the page.** Clicking Save/Unsave (and, latently, every other mutation button in the app) left the UI stale — the button stuck on its pending "…" state, counts and note text not updating — until a manual reload. Root cause: `<form action={serverAction}>` completing doesn't reliably trigger Next's client router to refetch this app's server-rendered data on its own. Fix: new `RefreshingForm` client component (`app/_components/refreshing-form.tsx`) — a drop-in wrapper around `<form action={fn}>` that explicitly calls `router.refresh()` once the action settles. Swapped in everywhere a mutation form existed: save/unsave (`/`, `/jobs/[id]`), status change + remove (`/saved`), review approve/reject, rejected → review, and every admin/companies action (add, pause/resume, exclude, delete). `NoteEditor` (a bespoke client component, not a plain form) got the same `router.refresh()` added directly — it had the identical latent bug (showed the stale note after saving). `RefreshingForm`'s refresh call is now wrapped in `startTransition` per React's guidance for triggering it outside a plain click handler.

**Fix (2026-09-10, code; deploy pending): "Add a company" crashed on a duplicate slug.** `upsertCompany` called `prisma.company.create()` unconditionally (the form never sends an `id`), so re-adding an existing slug hit an uncaught unique-constraint violation → Next's generic "Application error" crash page. Now: `upsertCompany` upserts by slug (re-submitting the same slug updates that row instead of crashing), and all three company actions (`upsertCompany`, `toggleCompanyFlag`, `deleteCompany`) catch failures and redirect back to `/admin/companies?error=...`, which now renders a red banner instead of crashing.

- **New (unviewed) jobs sort to the top of `/`** — a stable JS sort on the fetched page (unviewed group first, existing datePosted/firstSeen order preserved within each group). Badge recolored to red.
- **"New!" badge now persists until interacted with**, not just until the next crawl. New `Job.viewedAt` column (migration `..._add_job_viewed_at`, backfilled from `firstSeen` so existing jobs don't all show as new). Set on: saving a job (`saveJob` action), opening `/jobs/[id]` (marked server-side before render, using the pre-update value for the badge on that same view), and clicking "View job" anywhere (new client `ViewJobLink` component + a directly-callable `markViewed(jobId)` action). `prefetch={false}` added to job-title links too, so list-view prefetching can't silently mark jobs viewed.

---

## 9. Decisions (resolved 2026-09-06)

1. **Monorepo tooling** — plain pnpm workspaces, no Turborepo. Revisit only if builds get slow.
2. **`/admin` auth** — HTTP basic auth via `ADMIN_USER` / `ADMIN_PASS` env vars, over Railway's HTTPS. A real auth library comes with the future multi-user work, not now.
3. **Crawl host** — Railway cron service on `worker`, daily. Guarded by in-script timeouts, a no-overlap lock, and a Railway usage cap (§5.5). Revisit GitHub Actions in M4+ if crawler traffic/cost grows.
4. **Detail page timing** — result cards only through M3; `/jobs/[id]` built in M4. Pull forward during M1 only if in-site description reading proves useful.
5. **Seed company list** — **done**: 20 Greenhouse-hosted companies assembled and token-verified live 2026-09-06, in [`m1-seed-companies.md`](./m1-seed-companies.md) (8 have an in-taxonomy role live today). **Amazon is excluded** (current employer) — enforced by `Company.excluded`, not just omission. FAANG (minus Amazon) confirmed *not* on Greenhouse → M4 custom adapters.

---

*Plan reviewed and approved 2026-09-06. Implementation (Gate 3) begins with M0.*
