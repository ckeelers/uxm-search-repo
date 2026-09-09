import { prisma, JobStatus, MatchOutcome } from "@searchexperience/core";
import { reviewDecision } from "../actions";
import { SubmitButton } from "../../_components/submit-button";
import { monogram } from "../../../lib/monogram";
import s from "../shared.module.css";

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
    return <p className={s.empty}>Review queue is empty.</p>;
  }

  return (
    <>
      <p className={s.intro}>
        {rows.length} borderline role{rows.length === 1 ? "" : "s"} — Stage 1
        matched a title pattern but the discipline is ambiguous.
      </p>
      <ul className={s.list}>
        {rows.map((job) => (
          <li key={job.id} className={s.card}>
            <div className={s.avatar}>{monogram(job.company.name)}</div>
            <div className={s.cardMain}>
              <div className={s.titleRow}>
                <span className={s.jobTitle}>{job.rawTitle}</span>
                <span className={s.company}>{job.company.name}</span>
                <span className={s.reason}>{job.matchReason}</span>
              </div>
              <div className={s.meta}>
                norm: <code>{job.normalizedTitle}</code>
                {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
                {job.salaryMidpoint
                  ? ` · ~$${Math.round(job.salaryMidpoint / 1000)}k`
                  : ""}
              </div>
              <p className={s.excerpt}>{job.descriptionText.slice(0, 400)}…</p>
              <div className={s.actions}>
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={s.link}
                >
                  Open posting ↗
                </a>
                {(
                  [
                    ["approve", "✓ Include", s.btnApprove],
                    ["reject", "✕ Reject", s.btnReject],
                  ] as const
                ).map(([decision, label, cls]) => (
                  <form key={decision} action={reviewDecision}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="decision" value={decision} />
                    <SubmitButton className={cls}>{label}</SubmitButton>
                  </form>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
