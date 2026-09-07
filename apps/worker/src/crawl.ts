import { prisma } from "@searchexperience/core";

const MAX_RUNTIME_MS = Number(process.env.CRAWL_MAX_RUNTIME_MS ?? 15 * 60 * 1000);

/**
 * M0 scaffold: prove the worker can reach the database and exit cleanly.
 * M1 replaces the body with the real per-company crawl pipeline
 * (see plans/implementation-plan.md §5.3).
 */
async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[crawl] start ${new Date(startedAt).toISOString()}`);

  const [companies, jobs] = await Promise.all([
    prisma.company.count(),
    prisma.job.count(),
  ]);
  console.log(`[crawl] index state — companies=${companies} jobs=${jobs}`);

  console.log(`[crawl] done in ${Date.now() - startedAt}ms`);
}

// Global runaway guard (plan §5.5): the process cannot outlive this.
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
