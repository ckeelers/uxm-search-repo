# M1 Seed Companies (Greenhouse)

> Assembled 2026-09-06 for [`implementation-plan.md`](./implementation-plan.md) §8 M1.
> Every token below was hit live at `https://boards-api.greenhouse.io/v1/boards/<token>/jobs` and returned **HTTP 200** with a real job list on 2026-09-06.
> **Amazon is deliberately absent** (builder's current employer — `Company.excluded = true`).

## The list (20)

| # | Company | `platformId` (token) | Jobs (2026-09-06) | Design-manager-track role live right now? |
|---|---|---|---|---|
| 1 | Stripe | `stripe` | 617 | **Yes** — "Product Design Manager, Global Payments" *and* "UX Research Manager, Payments" (one per track) |
| 2 | Figma | `figma` | 157 | **Yes** — "Manager, Product Design"; "Manager, Design – Systems & Infrastructure" |
| 3 | Discord | `discord` | 48 | **Yes** — "Senior Product Design Manager, Growth" (band $272k–$306k) |
| 4 | Gusto | `gusto` | 95 | **Yes** — "Product Design Manager, Payroll"; "Product Design Leader, Banking" (multi-zone bands) |
| 5 | Lyft | `lyft` | 168 | **Yes** — "Product Design Manager, Design Systems" ($176k–$220k) |
| 6 | Pinterest | `pinterest` | 189 | **Yes** — "Product Design Manager II, Ad Formats" ($158k–$326k) |
| 7 | Fivetran | `fivetran` | 211 | **Yes** — "Senior Product Design Manager" ($201k–$252k) |
| 8 | DoorDash | `doordashusa` | 456 | **Yes** — "Senior Product Design Manager, Integrity" |
| 9 | Samsara | `samsara` | 255 | Director-tier only — "Director, Product Design" (Stage-1 reject in v1, but signals active design hiring) |
| 10 | Coinbase | `coinbase` | 192 | Not today — large design org, roles rotate |
| 11 | Dropbox | `dropbox` | 42 | Not today — established design org |
| 12 | Reddit | `reddit` | 148 | Not today — large design org |
| 13 | Robinhood | `robinhood` | 128 | Not today — large design org |
| 14 | Instacart | `instacart` | 110 | Not today — large design org |
| 15 | Airbnb | `airbnb` | 167 | Not today — famously design-led |
| 16 | Asana | `asana` | 115 | Not today — strong design org |
| 17 | Duolingo | `duolingo` | 89 | Not today — strong design org |
| 18 | Roblox | `roblox` | 230 | Not today — large design org |
| 19 | Brex | `brex` | 282 | Not today — fintech design org |
| 20 | Chime | `chime` | 65 | Director-tier only — "Design Director" |

8 of 20 have a live in-taxonomy role on day one — enough to prove M1 end to end. The rest are on the list because they run substantial product-design orgs that cycle these roles regularly; the crawler watches them so nothing is missed.

## Not on Greenhouse (checked, 404) — deferred to M4 custom adapters

FAANG-minus-Amazon: **Meta, Apple, Netflix, Google** all run bespoke career systems. Also not on Greenhouse: Snowflake, Notion, Plaid, Ramp, Rippling, Stripe-adjacent names like Wealthfront, NerdWallet, Grammarly, Zapier, HashiCorp, Segment. These need their own adapters (Workday / custom / Playwright) — M4.

## Greenhouse API notes for the M1 adapter (verified against live data)

**Endpoint:** `GET https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true` — one call returns every posting with full content.

**Fields the adapter maps:**
| Greenhouse field | Maps to | Notes |
|---|---|---|
| `id` (top-level int) | `Job.externalId` | Stable per posting. |
| `title` | `Job.rawTitle` | Feed to `normalizeTitle`. |
| `location.name` | raw location → `classifyLocation` | **Messy free text** — see below. |
| `absolute_url` | `Job.sourceUrl` | Points at the *company's own* page; the exact host varies per company (`job-boards.greenhouse.io/...`, `stripe.com/jobs/...`, `app.careerpuck.com/...`, `www.pinterestcareers.com/...`). Pass through unchanged. |
| `content` | `Job.descriptionText` | HTML — strip tags to text before storing / scanning. |
| `first_published` | `Job.datePosted` | ISO timestamp; this is the spec's "date posted". |
| `updated_at` | (not stored; useful for debugging) | |
| `departments[].name`, `offices[].name` | context for Stage 2 / debugging | e.g. `"8811 Product Design"`. |
| `metadata` | check for structured pay/location | Present on some boards, inconsistent. |

**Compensation:** US roles almost always embed a pay band in `content` text (pay-transparency laws). Real formats seen on design-manager roles:
- `"$176,000 - $220,000"`, `"$272,000 to $306,000"` — single range
- bare consecutive figures `"$201,765" … "$252,206"` — range split across markup
- **multiple bands in one posting** (Gusto: `$147,000–$215,000` for one zone, `$178,000–$253,000` for another) → the salary parser must extract all bands and take the **lowest** one, per the spec
- non-US roles (Stripe UK) carry **no** band → `SalaryState = UNKNOWN`

**Location:** `location.name` is the hardest input. Real values observed:
- `"New York, NY"` — clean
- `"Oakland, California, United States, AMER"` — full state name + region suffix
- `"San Francisco Bay Area"` — metro name, no state token
- `"San Francisco, CA, US; Remote, US"` — onsite + remote in one field
- `"Denver, CO - Hybrid; New York, New York, United States; San Francisco, CA - Hybrid"` — **semicolon-delimited multi-location with embedded arrangement keywords**
- `"San Francisco, CA • New York, NY • United States"` — Figma uses a **bullet (` • `)** separator instead of `;`
- `"San Francisco, CA; New York, NY; Seattle, WA"` — DoorDash: semicolons, no arrangement word (arrangement is in the body)

`classifyLocation` therefore needs to: split on `;`, detect `remote`/`hybrid`/`onsite` keywords inside each part, map metro names → states, recognise full state names and 2-letter codes, and treat "Remote, US" as `REMOTE` + `ANYWHERE_US` unless a state list is stated in `content`.

These three files (`taxonomy`, `salary`, `location` in `packages/core`) each get a Vitest suite seeded with the exact strings above before being wired into the pipeline.
