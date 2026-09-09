import { prisma } from "@searchexperience/core";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d ? d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default async function CrawlsPage() {
  const runs = await prisma.crawlRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { company: { select: { slug: true } } },
  });

  if (runs.length === 0) {
    return <p className="text-sm text-neutral-500">No crawl runs recorded yet.</p>;
  }

  // the most recent crawl == everything since the newest run's start, minus a margin
  const newest = runs[0]!.startedAt.getTime();
  const lastCrawl = runs.filter((r) => newest - r.startedAt.getTime() < 60 * 60 * 1000);
  const sum = (k: "jobsSeen" | "jobsNew" | "jobsClosed") =>
    lastCrawl.reduce((n, r) => n + r[k], 0);
  const erroredCompanies = lastCrawl.filter((r) => r.errorText);

  return (
    <>
      <div className="mb-5 rounded-lg border border-neutral-200 p-4 text-sm">
        <div className="font-medium">
          Last crawl · {fmt(runs[0]!.startedAt)}
        </div>
        <div className="mt-1 text-neutral-500">
          {lastCrawl.length} companies · seen {sum("jobsSeen")} · new {sum("jobsNew")} ·
          closed {sum("jobsClosed")} ·{" "}
          <span className={erroredCompanies.length ? "text-red-600" : ""}>
            {erroredCompanies.length} errored
          </span>
        </div>
        {erroredCompanies.length > 0 && (
          <div className="mt-1 text-xs text-red-600">
            {erroredCompanies.map((r) => r.company?.slug ?? "?").join(", ")}
          </div>
        )}
      </div>

      <p className="mb-3 text-sm text-neutral-500">Last {runs.length} company runs</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-2 pr-4">Company</th>
              <th className="py-2 pr-4">Started</th>
              <th className="py-2 pr-4">Seen</th>
              <th className="py-2 pr-4">New</th>
              <th className="py-2 pr-4">Closed</th>
              <th className="py-2">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {runs.map((r) => (
              <tr key={r.id} className={r.errorText ? "bg-red-50/50" : ""}>
                <td className="py-2 pr-4 font-medium">{r.company?.slug ?? "—"}</td>
                <td className="py-2 pr-4 text-neutral-500">{fmt(r.startedAt)}</td>
                <td className="py-2 pr-4">{r.jobsSeen}</td>
                <td className="py-2 pr-4">{r.jobsNew}</td>
                <td className="py-2 pr-4">{r.jobsClosed}</td>
                <td className="py-2 text-red-600">{r.errorText ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
