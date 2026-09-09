import {
  prisma,
  normalizeTitle,
  matchTitle,
  contentCheck,
  parseCompensation,
  classifyLocation,
  MatchOutcome,
  SalaryState,
  JobStatus,
  Track,
  type Company,
} from "@searchexperience/core";
import { greenhouseAdapter } from "./adapters/greenhouse";
import { leverAdapter } from "./adapters/lever";
import { ashbyAdapter } from "./adapters/ashby";
import { workdayAdapter } from "./adapters/workday";
import type { Adapter, RawJob } from "./adapters/types";
import { isBlock } from "./http";

// Kept below the shortest sensible cron interval so a hung run always dies
// before the next one fires.
const MAX_RUNTIME_MS = Number(process.env.CRAWL_MAX_RUNTIME_MS ?? 10 * 60 * 1000);
// A missed job is closed once it has gone unseen this long — cadence-independent,
// so the same rule works whether the cron is twice a day or every 15 minutes.
// 36h ≈ unseen across ~3 twice-daily crawls, well clear of one flaky run.
const CLOSE_AFTER_STALE_MS =
  Number(process.env.CLOSE_AFTER_STALE_HOURS ?? 36) * 60 * 60 * 1000;
// If a run is still marked in-progress and younger than this, skip this tick.
const IN_PROGRESS_WINDOW_MS = 12 * 60 * 1000;
const DELAY_BETWEEN_COMPANIES_MS = 1_000;
const SALARY_FLOOR = 150_000; // spec: base-band midpoint must be >= this

// a human verdict from /admin — the crawl refreshes everything else about the
// job but never re-decides its outcome/track.
const HUMAN_DECISIONS = new Set(["admin-reject", "admin-approve", "admin-reopened"]);

const ADAPTERS: Record<string, Adapter> = {
  GREENHOUSE: greenhouseAdapter,
  LEVER: leverAdapter,
  ASHBY: ashbyAdapter,
  WORKDAY: workdayAdapter,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OUTCOME_MAP: Record<
  ReturnType<typeof matchTitle>["outcome"],
  MatchOutcome
> = {
  STAGE1_INCLUDE: MatchOutcome.STAGE1_INCLUDE,
  REVIEW_QUEUE: MatchOutcome.REVIEW_QUEUE,
  REJECTED: MatchOutcome.REJECTED,
};

interface CompanyResult {
  seen: number;
  created: number;
  included: number;
  closed: number;
  blocked: boolean;
  error?: string;
}

async function crawlCompany(company: Company): Promise<CompanyResult> {
  const adapter = ADAPTERS[company.platform];
  const run = await prisma.crawlRun.create({
    data: { companyId: company.id },
  });

  if (!adapter) {
    const error = `no adapter for platform ${company.platform}`;
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), errorText: error },
    });
    return { seen: 0, created: 0, included: 0, closed: 0, blocked: false, error };
  }

  let raw: RawJob[];
  try {
    raw = await adapter.listJobs(company);
  } catch (err) {
    const blocked = isBlock(err);
    const error = err instanceof Error ? err.message : String(err);
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), errorText: error },
    });
    // A blocked/failed fetch must NOT age out this company's jobs (plan §5.3).
    return { seen: 0, created: 0, included: 0, closed: 0, blocked, error };
  }

  const seenIds: string[] = [];
  let created = 0;
  let included = 0;

  for (const r of raw) {
    seenIds.push(r.externalId);
    const normalizedTitle = normalizeTitle(r.title);
    const title = matchTitle(normalizedTitle);
    const loc = classifyLocation(r.locationText, r.descriptionText);
    const comp = parseCompensation(r.compText);

    // start from the title verdict; let location / salary veto an include
    let matchOutcome = OUTCOME_MAP[title.outcome];
    let matchReason: string | null = title.reason ?? null;
    let track: Track | null =
      title.outcome === "STAGE1_INCLUDE" && title.track ? title.track : null;

    // Stage 2: borderline titles get a description content check
    if (title.outcome === "REVIEW_QUEUE") {
      const cc = contentCheck(r.descriptionText);
      if (cc.decision === "auto-include") {
        matchOutcome = MatchOutcome.STAGE2_INCLUDE;
        matchReason = `stage2:${title.reason}(+${cc.score})`;
        track = title.track ?? Track.UX_DESIGN_MGR;
      } else if (cc.decision === "reject") {
        matchOutcome = MatchOutcome.REJECTED;
        matchReason = `stage2-reject:${title.reason}(${cc.score})`;
      } else {
        matchReason = `${title.reason}(stage2 ${cc.score})`;
      }
    }

    const wouldSurface =
      matchOutcome === MatchOutcome.STAGE1_INCLUDE ||
      matchOutcome === MatchOutcome.STAGE2_INCLUDE ||
      matchOutcome === MatchOutcome.REVIEW_QUEUE;

    // a stated non-US country, with nothing US in the location, overrides
    const nonUsByCountry =
      r.countryHint != null &&
      r.countryHint !== "US" &&
      loc.siteStates.length === 0 &&
      !loc.remoteUs;

    if (wouldSurface && (!loc.isUsBased || nonUsByCountry)) {
      matchOutcome = MatchOutcome.REJECTED;
      matchReason = "non-us";
      track = null;
    } else if (
      wouldSurface &&
      comp.state === SalaryState.STATED &&
      (comp.midpoint ?? 0) < SALARY_FLOOR
    ) {
      matchOutcome = MatchOutcome.REJECTED;
      matchReason = "below-threshold";
      track = null;
    }

    if (matchOutcome === MatchOutcome.STAGE1_INCLUDE) included++;

    const mutable = {
      sourceUrl: r.sourceUrl,
      rawTitle: r.title,
      normalizedTitle,
      track,
      matchOutcome,
      matchReason,
      descriptionText: r.descriptionText,
      rawLocationText: r.locationText ?? null,
      siteStates: loc.siteStates,
      siteArrangement: loc.siteArrangement,
      remoteUs: loc.remoteUs,
      remoteScope: loc.remoteScope,
      remoteStates: loc.remoteStates,
      salaryState: comp.state,
      salaryMin: comp.min ?? null,
      salaryMax: comp.max ?? null,
      salaryMidpoint: comp.midpoint ?? null,
      compRawText: comp.raw ?? null,
      datePosted: r.datePosted ?? null,
    };

    const existing = await prisma.job.findUnique({
      where: {
        companyId_externalId: {
          companyId: company.id,
          externalId: r.externalId,
        },
      },
      select: { id: true, matchReason: true },
    });

    if (existing) {
      // don't re-decide a job a human has already ruled on in /admin
      const locked =
        existing.matchReason != null && HUMAN_DECISIONS.has(existing.matchReason);
      const { matchOutcome: _o, matchReason: _r, track: _t, ...rest } = mutable;
      await prisma.job.update({
        where: { id: existing.id },
        data: {
          ...(locked ? rest : mutable),
          lastVerified: new Date(),
          missedCrawls: 0,
          status: JobStatus.OPEN,
          closedAt: null,
        },
      });
    } else {
      // firstSeen === lastVerified marks a job as "new" until the next crawl
      // bumps lastVerified. Set both to the same instant explicitly.
      const now = new Date();
      await prisma.job.create({
        data: {
          companyId: company.id,
          externalId: r.externalId,
          ...mutable,
          firstSeen: now,
          lastVerified: now,
        },
      });
      created++;
    }
  }

  // reconcile: OPEN jobs we did not see this run
  const stale = await prisma.job.findMany({
    where: {
      companyId: company.id,
      status: JobStatus.OPEN,
      externalId: { notIn: seenIds },
    },
    select: { id: true, missedCrawls: true, lastVerified: true },
  });

  const now = Date.now();
  let closed = 0;
  for (const s of stale) {
    // close only once the job has been unseen for CLOSE_AFTER_STALE_MS —
    // not after N misses, so a fast cron doesn't close jobs prematurely.
    const close = now - s.lastVerified.getTime() >= CLOSE_AFTER_STALE_MS;
    await prisma.job.update({
      where: { id: s.id },
      data: close
        ? {
            missedCrawls: s.missedCrawls + 1,
            status: JobStatus.CLOSED,
            closedAt: new Date(),
          }
        : { missedCrawls: s.missedCrawls + 1 },
    });
    if (close) closed++;
  }

  await prisma.crawlRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      jobsSeen: raw.length,
      jobsNew: created,
      jobsClosed: closed,
    },
  });

  return { seen: raw.length, created, included, closed, blocked: false };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[crawl] start ${new Date(startedAt).toISOString()}`);

  // don't stack up if a previous run (fast cron) is still going
  const inflight = await prisma.crawlRun.findFirst({
    where: {
      finishedAt: null,
      startedAt: { gt: new Date(startedAt - IN_PROGRESS_WINDOW_MS) },
    },
  });
  if (inflight) {
    console.log("[crawl] a recent run is still in progress — skipping this tick");
    return;
  }

  const companies = await prisma.company.findMany({
    where: { active: true, excluded: false },
    orderBy: { slug: "asc" },
  });
  console.log(`[crawl] ${companies.length} companies to crawl`);

  const totals = { seen: 0, created: 0, included: 0, closed: 0, blocked: 0, errored: 0 };

  for (const company of companies) {
    try {
      const r = await crawlCompany(company);
      totals.seen += r.seen;
      totals.created += r.created;
      totals.included += r.included;
      totals.closed += r.closed;
      if (r.blocked) totals.blocked++;
      if (r.error && !r.blocked) totals.errored++;
      const tag = r.blocked ? " BLOCKED" : r.error ? ` ERROR: ${r.error}` : "";
      console.log(
        `[crawl] ${company.slug.padEnd(14)} seen=${r.seen} new=${r.created} included=${r.included} closed=${r.closed}${tag}`,
      );
    } catch (err) {
      totals.errored++;
      console.error(`[crawl] ${company.slug}: unexpected`, err);
    }
    await sleep(DELAY_BETWEEN_COMPANIES_MS);
  }

  console.log(
    `[crawl] done in ${Math.round((Date.now() - startedAt) / 1000)}s — ` +
      `seen=${totals.seen} new=${totals.created} included=${totals.included} ` +
      `closed=${totals.closed} blocked=${totals.blocked} errored=${totals.errored}`,
  );
}

const killTimer = setTimeout(() => {
  console.error(`[crawl] exceeded CRAWL_MAX_RUNTIME_MS (${MAX_RUNTIME_MS}ms) — aborting`);
  process.exit(1);
}, MAX_RUNTIME_MS);
killTimer.unref();

main()
  .then(async () => {
    clearTimeout(killTimer);
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    clearTimeout(killTimer);
    console.error("[crawl] failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
