import { prisma } from "@searchexperience/core";
import s from "../shared.module.css";

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
    return <p className={s.empty}>No crawl runs recorded yet.</p>;
  }

  const newest = runs[0]!.startedAt.getTime();
  const lastCrawl = runs.filter((r) => newest - r.startedAt.getTime() < 60 * 60 * 1000);
  const sum = (k: "jobsSeen" | "jobsNew" | "jobsClosed") =>
    lastCrawl.reduce((n, r) => n + r[k], 0);
  const erroredCompanies = lastCrawl.filter((r) => r.errorText);

  return (
    <>
      <div className={`${s.card2} mb-5 p-4 text-sm`}>
        <div className="font-medium">Last crawl · {fmt(runs[0]!.startedAt)}</div>
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

      <p className={s.intro}>Last {runs.length} company runs</p>
      <div className={s.card2}>
        <table className={s.table}>
          <thead className={s.thead}>
            <tr>
              <th className={s.th}>Company</th>
              <th className={s.th}>Started</th>
              <th className={s.th}>Seen</th>
              <th className={s.th}>New</th>
              <th className={s.th}>Closed</th>
              <th className={s.th}>Error</th>
            </tr>
          </thead>
          <tbody className={s.tbody}>
            {runs.map((r) => (
              <tr key={r.id} className={r.errorText ? s.rowErr : ""}>
                <td className={`${s.td} font-medium`}>{r.company?.slug ?? "—"}</td>
                <td className={`${s.td} text-neutral-500`}>{fmt(r.startedAt)}</td>
                <td className={s.td}>{r.jobsSeen}</td>
                <td className={s.td}>{r.jobsNew}</td>
                <td className={s.td}>{r.jobsClosed}</td>
                <td className={`${s.td} text-red-600`}>{r.errorText ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
