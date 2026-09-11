import { prisma, JobStatus, MatchOutcome } from "@searchexperience/core";
import { reopenToReview } from "../actions";
import { SubmitButton } from "../../_components/submit-button";
import { RefreshingForm } from "../../_components/refreshing-form";
import s from "../shared.module.css";

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
      <p className={s.intro}>
        {rejects.length} rejected open roles, by reason — sanity-check the taxonomy.
        {focus ? (
          <>
            {" "}
            <a href="/admin/rejected" className={s.link}>
              clear filter
            </a>
          </>
        ) : null}
      </p>

      <div className={s.reasonChips}>
        {sorted.map(([f, list]) => (
          <a
            key={f}
            href={`/admin/rejected?reason=${encodeURIComponent(f)}`}
            className={focus === f ? s.chipActive : s.chip}
          >
            {f} · {list.length}
          </a>
        ))}
      </div>

      {sorted
        .filter(([f]) => !focus || f === focus)
        .map(([f, list]) => (
          <section key={f} className={s.group}>
            <h2 className={s.groupHead}>
              {f} <span className={s.groupCount}>({list.length})</span>
            </h2>
            <ul className={s.rejList}>
              {list.slice(0, focus ? 200 : 8).map((j) => (
                <li key={j.id} className={s.rejRow}>
                  <span className="min-w-0">
                    <span className="font-medium">{j.rawTitle}</span>{" "}
                    <span className={s.company}>· {j.company.name}</span>{" "}
                    <span className={s.rejReason}>— {j.matchReason}</span>
                  </span>
                  <RefreshingForm action={reopenToReview} className="shrink-0">
                    <input type="hidden" name="jobId" value={j.id} />
                    <SubmitButton className={s.link} pendingText="…">
                      → review
                    </SubmitButton>
                  </RefreshingForm>
                </li>
              ))}
              {!focus && list.length > 8 && (
                <li className={s.more}>
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
