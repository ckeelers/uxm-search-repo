import {
  prisma,
  normalizeTitle,
  matchTitle,
  parseCompensation,
  classifyLocation,
  MatchOutcome,
  SalaryState,
  JobStatus,
  type Company,
  type Track,
} from "@searchexperience/core";
import { greenhouseAdapter } from "./adapters/greenhouse";
import type { Adapter, RawJob } from "./adapters/types";
import { isBlock } from "./http";

const MAX_RUNTIME_MS = Number(process.env.CRAWL_MAX_RUNTIME_MS ?? 15 * 60 * 1000);
const CLOSE_AFTER_MISSED_CRAWLS = Number(
  process.env.CLOSE_AFTER_MISSED_CRAWLS ?? 2,
);
const DELAY_BETWEEN_COMPANIES_MS = 1_000;
const SALARY_FLOOR = 150_000; // spec: base-band midpoint must be >= this

const ADAPTERS: Record<string, Adapter> = {
  GREENHOUSE: greenhouseAdapter,
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

    const wouldSurface =
      matchOutcome === MatchOutcome.STAGE1_INCLUDE ||
      matchOutcome === MatchOutcome.STAGE2_INCLUDE ||
      matchOutcome === MatchOutcome.REVIEW_QUEUE;

    if (wouldSurface && !loc.isUsBased) {
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
      select: { id: true },
    });

    if (existing) {
      await prisma.job.update({
        where: { id: existing.id },
        data: {
          ...mutable,
          lastVerified: new Date(),
          missedCrawls: 0,
          status: JobStatus.OPEN,
          closedAt: null,
        },
      });
    } else {
      await prisma.job.create({
        data: {
          companyId: company.id,
          externalId: r.externalId,
          ...mutable,
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
    select: { id: true, missedCrawls: true },
  });

  let closed = 0;
  for (const s of stale) {
    const missed = s.missedCrawls + 1;
    const close = missed >= CLOSE_AFTER_MISSED_CRAWLS;
    await prisma.job.update({
      where: { id: s.id },
      data: close
        ? { missedCrawls: missed, status: JobStatus.CLOSED, closedAt: new Date() }
        : { missedCrawls: missed },
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
