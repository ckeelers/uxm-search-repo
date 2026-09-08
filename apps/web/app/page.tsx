import { prisma, MatchOutcome, JobStatus, Track } from "@searchexperience/core";

export const dynamic = "force-dynamic";

const TRACK_LABEL: Record<Track, string> = {
  UX_DESIGN_MGR: "UX / Design Manager",
  UX_RESEARCH_MGR: "UX Research Manager",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function getJobs() {
  return prisma.job.findMany({
    where: {
      status: JobStatus.OPEN,
      matchOutcome: {
        in: [MatchOutcome.STAGE1_INCLUDE, MatchOutcome.STAGE2_INCLUDE],
      },
    },
    orderBy: [{ datePosted: { sort: "desc", nulls: "last" } }, { firstSeen: "desc" }],
    include: { company: { select: { name: true } } },
    take: 200,
  });
}

export default async function HomePage() {
  let jobs: Awaited<ReturnType<typeof getJobs>> = [];
  let error = false;
  try {
    jobs = await getJobs();
  } catch {
    error = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">searchexperience</h1>
        <p className="mt-2 text-neutral-600">
          UX Manager roles, sourced only from company career pages.
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          M1 — Greenhouse companies, title match only. Salary &amp; location
          filters land in M2.
        </p>
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load jobs — database unavailable.
        </p>
      ) : jobs.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          No roles indexed yet. Run the crawler.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-neutral-500">
            {jobs.length} open role{jobs.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-neutral-200">
            {jobs.map((job) => (
              <li key={job.id} className="py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-medium">{job.rawTitle}</span>
                  <span className="text-neutral-500">· {job.company.name}</span>
                  {job.track && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                      {TRACK_LABEL[job.track]}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  Posted {fmtDate(job.datePosted)} · Seen {fmtDate(job.firstSeen)}{" "}
                  · Verified {fmtDate(job.lastVerified)}
                  {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
                </div>
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm text-blue-600 hover:underline"
                >
                  Apply on {job.company.name} site ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
