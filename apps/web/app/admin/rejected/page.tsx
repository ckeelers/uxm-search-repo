import { prisma, JobStatus, MatchOutcome } from "@searchexperience/core";
import { reopenToReview } from "../actions";
import { SubmitButton } from "../../_components/submit-button";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

/** Collapse "disqualified:program manager" / "stage2-reject:..." to a family. */
function family(reason: string | null): string {
  if (!reason) return "(none)";
  const head = reason.split(/[:(]/)[0]!.trim();
  return head || reason;
}

export default async function RejectedPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const focus = (Array.isArray(sp.reason) ? sp.reason[0] : sp.reason) ?? "";

  const rejects = await prisma.job.findMany({
    where: { status: JobStatus.OPEN, matchOutcome: MatchOutcome.REJECTED },
    select: {
      id: true,
      rawTitle: true,
      normalizedTitle: true,
      matchReason: true,
      rawLocationText: true,
      company: { select: { name: true } },
    },
    orderBy: { firstSeen: "desc" },
    take: 4000,
  });

  const groups = new Map<string, typeof rejects>();
  for (const j of rejects) {
    const f = family(j.matchReason);
    const list = groups.get(f) ?? [];
    list.push(j);
    groups.set(f, list);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <p className="mb-4 text-sm text-neutral-500">
        {rejects.length} rejected open roles, by reason — sanity-check the taxonomy.
        {focus ? (
          <>
            {" "}
            <a href="/admin/rejected" className="text-blue-600 hover:underline">
              clear filter
            </a>
          </>
        ) : null}
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {sorted.map(([f, list]) => (
          <a
            key={f}
            href={`/admin/rejected?reason=${encodeURIComponent(f)}`}
            className={`rounded border px-2 py-1 text-xs ${
              focus === f
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            {f} · {list.length}
          </a>
        ))}
      </div>

      {sorted
        .filter(([f]) => !focus || f === focus)
        .map(([f, list]) => (
          <section key={f} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">
              {f} <span className="text-neutral-400">({list.length})</span>
            </h2>
            <ul className="divide-y divide-neutral-100 text-sm">
              {list.slice(0, focus ? 200 : 8).map((j) => (
                <li key={j.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="font-medium">{j.rawTitle}</span>{" "}
                    <span className="text-neutral-500">· {j.company.name}</span>{" "}
                    <span className="text-neutral-400">— {j.matchReason}</span>
                  </span>
                  <form action={reopenToReview} className="shrink-0">
                    <input type="hidden" name="jobId" value={j.id} />
                    <SubmitButton className="text-blue-600 hover:underline" pendingText="…">
                      → review
                    </SubmitButton>
                  </form>
                </li>
              ))}
              {!focus && list.length > 8 && (
                <li className="py-1.5 text-xs text-neutral-400">
                  <a
                    href={`/admin/rejected?reason=${encodeURIComponent(f)}`}
                    className="hover:underline"
                  >
                    +{list.length - 8} more…
                  </a>
                </li>
              )}
            </ul>
          </section>
        ))}
    </>
  );
}
