import { prisma, JobStatus, MatchOutcome } from "@searchexperience/core";
import { reviewDecision } from "../actions";
import { SubmitButton } from "../../_components/submit-button";

export const dynamic = "force-dynamic";

async function getQueue() {
  return prisma.job.findMany({
    where: { status: JobStatus.OPEN, matchOutcome: MatchOutcome.REVIEW_QUEUE },
    orderBy: [{ datePosted: { sort: "desc", nulls: "last" } }, { firstSeen: "desc" }],
    include: { company: { select: { name: true } } },
    take: 200,
  });
}

export default async function ReviewPage() {
  const rows = await getQueue();

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Review queue is empty.</p>;
  }

  return (
    <>
      <p className="mb-4 text-sm text-neutral-500">
        {rows.length} borderline role{rows.length === 1 ? "" : "s"} — Stage 1 matched a
        title pattern but the discipline is ambiguous.
      </p>
      <ul className="space-y-5">
        {rows.map((job) => (
          <li key={job.id} className="rounded-lg border border-neutral-200 p-4">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{job.rawTitle}</span>
              <span className="text-neutral-500">· {job.company.name}</span>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                {job.matchReason}
              </span>
            </div>
            <div className="mt-1 text-xs text-neutral-400">
              norm: <code>{job.normalizedTitle}</code>
              {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
              {job.salaryMidpoint ? ` · ~$${Math.round(job.salaryMidpoint / 1000)}k` : ""}
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
              {job.descriptionText.slice(0, 400)}…
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open posting ↗
              </a>
              {(
                [
                  ["approve", "✓ Include"],
                  ["reject", "✕ Reject"],
                ] as const
              ).map(([decision, label]) => (
                <form key={decision} action={reviewDecision}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="decision" value={decision} />
                  <SubmitButton
                    className={`rounded border px-2 py-1 ${
                      decision === "reject"
                        ? "border-red-200 text-red-600 hover:bg-red-50"
                        : "border-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    {label}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
