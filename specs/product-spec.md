# Product Spec: searchexperience

> **Status:** Approved  
> **Phase:** Specification complete — Gate 1 of 3 passed  
> **Last updated:** 2026-09-06

---

## Problem Statement

UX Managers searching for jobs face a landscape built for generalists. Generic job boards (LinkedIn, Indeed, Glassdoor) surface roles indiscriminately, bury relevant postings in noise, and offer no UX-profession-specific filtering. Their compensation and location filters are just as blunt: pay bands are often missing or unreliable, and "remote" vs. "hybrid" vs. "onsite in a specific state" is collapsed into a single unusable field. The result: long, inefficient searches and missed opportunities from companies that don't know how to title or tag UX leadership roles consistently.

---

## Who This Is For

**Primary user:** A UX Manager actively looking for a new role.

Characteristics:
- Mid-to-senior level; likely 5–12 years experience
- Searches by discipline (Research, Product Design, Content Design, Systems) and team structure (IC-led, embedded, centralized)
- Cares about company culture signals: design maturity, team size, reporting structure
- Often searching quietly (employed), so speed and relevance matter more than volume
- Has a compensation floor (stated base pay band midpoint ≥ $150,000) and a geographic reality (a home state, with a specific tolerance for onsite / hybrid / remote)
- May want to track applications and bookmark roles across sessions

**How they search for their own role:**  
There are two distinct manager tracks this site serves. Both are in scope.

**Track 1 — UX / Design Manager**  
Leads a team of UX Designers responsible for defining strategy and executing design work. Titles include:
- "UX Manager" / "User Experience Manager"
- "UX Product Manager" / "UX/UI Manager"
- "Product Design Manager"
- Inverted forms: "Manager, UX Design" / "Manager, User Experience"

**Track 2 — UX Research Manager**  
Leads a team of Experience Researchers focused on ethnographic and qualitative research — understanding how customers actually engage with products, upstream of design execution. Titles include:
- "UX Research Manager" / "User Experience Research Manager"
- "Research Manager, UX" / "Manager, UX Research"
- "Experience Research Manager"

These are related but different roles. A UX Research Manager is not a UX Designer who manages — they lead a research discipline. Both tracks belong on this site; they should be distinguishable in search results so users can filter to the track relevant to them.

A critical frustration on generic boards: filtering for "Product" or "Manager" surfaces a flood of Product Manager (PM) roles, which are a different discipline entirely. This site must treat "Product Manager" as an explicit exclusion, not a match.

---

## Proposed Solution

A focused job search website that:
1. Surfaces UX Manager roles from a curated title taxonomy (see below), collected by a scheduled crawler into a searchable index (see "Data source & crawl model")
2. Sources jobs **exclusively from company career pages** — never from job boards or aggregators
3. Filters in ways generic boards don't: design org size, team structure, IC vs. manager ratio, design maturity signals
4. Presents roles in a clean, scannable format optimized for UX professionals
5. Allows saving, tracking, and returning to roles across visits

**Core differentiator — source exclusivity:**  
Every result links directly to the company's own job application page. No role sourced from LinkedIn, Indeed, Glassdoor, Monster, ZipRecruiter, or any other job board will appear. This means:
- No duplicate listings (same job posted across five boards)
- No outdated "easy apply" listings that have already been filled
- No middleman between the applicant and the company
- The application experience is always what the company intended

**The platform distinction:**  
Many companies host their career pages on recruiting platforms like Greenhouse, Lever, Workday, or Ashby (e.g., `jobs.lever.co/stripe` or `stripe.greenhouse.io`). Scraping these is allowed and encouraged — the entry point is the *company's* page on that platform, not the platform's own aggregated job board.

The rule is about *whose jobs* are being shown, not *where* they are hosted:
- Allowed: `jobs.lever.co/stripe` → Stripe's jobs, hosted on Lever
- Allowed: `careers.google.com` → Google's own career page
- Not allowed: `linkedin.com/jobs` → LinkedIn's board of jobs from many companies
- Not allowed: `indeed.com/jobs` → Indeed's aggregated listings

This is a scraping problem, not an API problem. The site must crawl company-specific career pages directly.

**Data source & crawl model:**  
Roles are collected by a **scheduled crawler**, not fetched live when a user searches.

- The crawler visits each target company's own career page (including the company's page on a recruiting platform — `jobs.lever.co/<company>`, `<company>.greenhouse.io`, etc.) on a recurring cadence and writes matching roles into the app's database (the **index**).
- All search results are served from the index; no scraping happens on the user's request path.
- Each indexed role stores a **first-seen** and a **last-verified** timestamp. Every listing shows "First seen [date] · Last verified [date]".
- If the posting states its own **date posted**, that date is captured and shown on the listing as well (distinct from first-seen, which is when the crawler first indexed the role). If the posting states no date, only first-seen and last-verified are shown.
- On each re-crawl, a role still present is re-verified (last-verified updated); a role **absent for N consecutive crawls** is marked **closed** and drops out of default search results.
- A **closed role a user has saved** stays in that user's saved list, tagged **"No longer listed"** with its last-verified date; the user chooses whether to archive it.
- **Target cadence:** every target company is re-crawled **at least daily**. Exact scheduling, per-site adapters, and crawl-rate limits are planning-phase details.

**Title taxonomy — a two-stage match:**  
Surfaced only if a role clears a title match; ambiguous titles get a second, content-based check. The taxonomy is expected to evolve as real job data reveals new patterns.

**Normalization (before any matching):** lowercase and collapse punctuation; strip seniority/scope modifiers (`Senior`, `Sr.`, `Lead`, `Group`, `Staff`, `Principal`) — they never affect a match; strip location / org / requisition-id suffixes; un-invert comma forms ("Manager, UX Design" → "UX Design Manager").

**Stage 1 — Title match**, applied in order:
1. **Disqualifiers win.** If the normalized title contains `product manager`, `program manager`, `project manager`, `engineering manager`, `product marketing manager`, `partner manager` (or similar) *without* an attached design/UX qualifier → reject.
2. **Discipline + leadership both required.** The title must contain a discipline token (`ux`, `user experience`, `ui`, `product design`, `experience design`, `interaction design`, `design systems`, `ux research`, `user research`) **and** a leadership token (`manager`, `management`, `head of`, `lead` used as a role). → "Product **Design** Manager" matches; "Product Manager" is rejected.
3. **No match → reject.**

Matched titles are classified into one of two tracks so results stay filterable:
- **UX / Design Manager track** — leads a team executing design work ("UX Manager", "User Experience Manager", "UX/UI Manager", "Product Design Manager", "Manager, UX Design", …).
- **UX Research Manager track** — leads a qualitative / ethnographic research discipline, upstream of design execution ("UX Research Manager", "User Experience Research Manager", "Experience Research Manager", "Research Manager, UX", …). A UX Research Manager is *not* a designer who manages.

**Stage 2 — Content check (borderline titles only).** Some titles pass Stage 1 but are genuinely ambiguous — e.g. "Design Manager" (could be brand / marketing design) or "UX Product Manager" (**not auto-included** — always routed here). For these, the job description is scanned for:
- **Corroborating signals:** "manage a team of designers", "design reviews", "hiring designers", "UX/UI", "usability", "user research", "Figma", "interaction design", "years managing / leading a design team"
- **Anti-signals:** "own the product roadmap", "backlog prioritization", "go-to-market", "P&L", "define product strategy" with no design responsibilities

Each borderline role is scored to **auto-include**, **review queue** (the builder glances before it shows), or **reject**. For v1 the review queue is a simple list the builder checks.

**Out for v1:** Director / Head of Design / VP tier (a later spec may add a Director track). Standalone Product / Program / Project / Engineering Manager roles never appear.

**Compensation filter:**  
Salary is a first-class filter, but a missing salary is never a reason to hide a role.

- **Only base salary counts** toward the threshold. Bonus, equity, and other components are displayed when stated but do not count.
- **If a base pay band is stated:** the role is surfaced when the band's **midpoint is ≥ $150,000/year** (a single stated figure is its own midpoint). Examples: $150k–$180k → shown; $140k–$200k → midpoint $170k → shown; $120k–$150k → midpoint $135k → hidden.
- **If the band is location-adjusted** (one posting, different ranges per geographic zone): use the **lowest zone's band**, then apply the midpoint rule.
- **If no salary or compensation is stated:** the role is still surfaced, tagged **"Salary unknown / unpublished."**
- Every listing displays its compensation state: the band exactly as posted, or the unknown/unpublished tag.
- Pay is normalized to annual USD for the midpoint test (hourly and monthly rates converted); the raw stated text is always shown alongside.

The $150,000 threshold and the midpoint rule are fixed for v1, not user-adjustable.

**Location filter:**  
All roles are **US-based** — any role that cannot be performed from within the United States is excluded entirely.

The user optionally sets a **Location** (a single US state) and selects any combination of three **work arrangements**: **onsite**, **hybrid**, **remote**. At least one arrangement must be selected; any combination is allowed.

- **Onsite** — roles with a physical worksite in the selected state that require onsite presence. If no state is set, all US onsite roles match.
- **Hybrid** — roles with a physical worksite in the selected state on a hybrid schedule. If no state is set, all US hybrid roles match.
- **Remote** — any US remote role. Remote matching does **not** depend on the selected state; a remote role is shown whether or not its eligibility is tied to specific states.

**Remote eligibility tags** — every remote result carries one:
- Posting names specific states where remote work is allowed → **"State requirements: [states]"**, shown even when the user's selected state is in that list.
- Posting places no state restriction → **"Remote: anywhere (US)"**.

A remote role is never hidden because of a state mismatch — the tag informs, it does not filter.

Worked examples:
- *Colorado — onsite* → roles with a Colorado worksite requiring onsite presence.
- *Colorado — hybrid + remote* → hybrid roles with a Colorado worksite, plus all US remote roles (each tagged).
- *No location — remote* → all US remote roles, each tagged.
- *No location — onsite + hybrid* → all US onsite and hybrid roles.

Each role is classified on two axes so these filters apply: **work arrangement** (onsite / hybrid / remote) and, for remote roles, **state eligibility** (a specific list of states vs. anywhere in the US). Granularity for v1 is the US state; finer granularity (metro, commute radius) is deferred to a later spec.

**Saved jobs:**  
A user can save any role and return to it in a later visit. v1 has no login — the app runs with a single implicit user, and saved jobs are stored **server-side in the app's database** (not in the browser), so the list is consistent across devices and browsers.

Each saved entry records the job, the date saved, and a user-changeable status (*saved* → *applied* → *archived*). Saved jobs are keyed to a user id even though v1 has only one user, so account creation can be added later as an additive change rather than a data migration.

---

## Success Criteria

- A UX Manager can open the site and find relevant roles faster than on LinkedIn or Indeed
- Every result is a UX Manager-track role — no Product Manager, Program Manager, or other non-design roles appear
- Every result links directly to a company's own career page — no job board middlemen
- Every result has a stated base band whose midpoint is ≥ $150,000, or is explicitly tagged "Salary unknown / unpublished" — no role with a stated sub-$150,000 midpoint appears
- Every result is US-based; the user can filter by any combination of onsite / hybrid / remote, optionally scoped to a chosen US state, and every remote result shows its state-eligibility tag
- Every result shows its recency: the posting's stated date posted (when available), plus first-seen and last-verified dates
- The site works well on both desktop and mobile
- A user can save a job and return to it later, from any device (saved server-side)

---

## Constraints

- Built by one person learning while building — decisions should favor clarity over cleverness
- Hosted on Railway; no other infrastructure to manage
- US-only: roles outside the United States are out of scope entirely
- The $150,000 band-midpoint threshold is fixed in v1 (not user-configurable)
- No budget for paid job data APIs — scraping company career pages directly is the data strategy
- Must be usable before it is "complete" — ship useful slices, not the whole vision at once
- v1 is single-user (the builder); multi-user accounts are explicitly deferred
- The builder's current employer (**Amazon**) is excluded outright — never crawled, never surfaced. (When accounts arrive, current-employer exclusion becomes a per-user setting.)

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Job data is stale or low-quality | Display source and date on every listing; let users flag stale roles |
| UX Manager roles are hard to identify reliably | Build a taxonomy of title patterns; refine over time |
| Company career pages vary wildly in structure | Build scraper per-site with adapters; prioritize companies with stable HTML or public APIs (Greenhouse, Lever, Workday, etc.) |
| Companies block scrapers | Use respectful crawl rates; handle bot-detection gracefully; fall back to manual curation for blocked sites |
| Scraped roles appear after they've been filled | Store first-seen and last-verified dates; re-crawl at least daily; mark a role closed after N consecutive crawls without it; let users report closed roles |
| Salary is stated in inconsistent formats (hourly, ranges, "competitive", location-adjusted) | Normalize base pay to annual USD and test the band midpoint; for location-adjusted bands use the lowest zone; when parsing is ambiguous, fall back to "Salary unknown / unpublished" rather than guessing |
| Work arrangement and remote state-eligibility are hard to infer from posting text | Classify on two explicit axes (arrangement; remote state-eligibility); never hide a remote role for a state mismatch — surface it with its eligibility tag and the raw location text so the user can verify |
| Scope creep into a full ATS/portfolio platform | Strictly out of scope for v1 — this is a *search* tool |

---

## Out of Scope (v1)

- User accounts and authentication (deferred — separate spec). A future account would add a **user profile** (desired location and work-arrangement preferences), a **saved-jobs dashboard**, and **job-lifecycle rules** (what happens when a saved role expires or is delisted). v1's server-side, user-keyed storage is designed so this is additive.
- Employer-facing features (job posting, company profiles)
- Resume/portfolio upload or matching
- Interview tracking or full ATS functionality
- Community or forum features
- Native mobile app
- Any role outside the UX Manager title taxonomy

---

## Open Questions (to resolve before planning)

- [x] What is the data source strategy? → **Direct scraping of company career pages only. No job boards.**
- [x] What tech stack? → **Hosted on Railway.** Stack details (language, framework, database) to be determined in planning, but Railway supports all likely options (Node.js/Python, PostgreSQL, scheduled scrape jobs). Sufficient for v1.
- [x] Will users need accounts? → **v1: no accounts — single implicit user (the builder); saved jobs stored server-side, keyed to a user id for forward compatibility.** Future: account creation, user profiles, and a saved-jobs dashboard for other job seekers is a later effort with its own spec.
- [x] What is the MVP? → **Search for UX Manager roles + save a job you're interested in.** Nothing more.
- [x] Which companies to target first? → **FAANG as the starting seed** (Meta, Apple, Amazon, Netflix, Google), expanding to any company with a matching UX Manager role. The company list grows organically as roles are discovered.
- [x] How does salary filter? → **Base salary only.** Include if the stated base band's midpoint ≥ $150,000/year (single figure = its own midpoint); for location-adjusted bands use the lowest zone. Include (tagged "Salary unknown / unpublished") if no compensation is stated. Threshold and midpoint rule fixed for v1.
- [x] How does location filter? → **US-based.** User optionally sets one US state and checks any combination of onsite / hybrid / remote (≥ 1 required). Onsite/hybrid require a worksite in the state (or, with no state, match anywhere in the US); remote matches any US remote role regardless of state and is never hidden for a state mismatch — instead each remote result is tagged "State requirements: […]" or "Remote: anywhere (US)". State-level granularity for v1; metro/commute-radius deferred.

---

*Spec reviewed and approved 2026-09-06. Proceed to planning (Gate 2).*
*Amended 2026-09-06 during planning: added the current-employer (Amazon) exclusion.*
