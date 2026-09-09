import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, JobStatus } from "@searchexperience/core";
import { saveJob, removeSaved } from "../../actions";
import { OWNER_ID } from "../../../lib/owner";
import { SubmitButton } from "../../_components/submit-button";
import { SiteHeader } from "../../_components/site-header";
import { monogram } from "../../../lib/monogram";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null): string {
  return d
    ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "—";
}

function band(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return null;
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  return min === max ? k(min) : `${k(min)}–${k(max)}`;
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [job, saved] = await Promise.all([
    prisma.job.findUnique({
      where: { id },
      include: { company: { select: { name: true } } },
    }),
    prisma.savedJob.findFirst({ where: { jobId: id, userId: OWNER_ID } }),
  ]);
  if (!job) notFound();

  const salary = band(job.salaryMin, job.salaryMax);

  return (
    <div className={styles.screen}>
      <SiteHeader />

      <div className={styles.body}>
        <Link href="/" className={styles.back}>
          ← Back to search
        </Link>

        <div className={styles.head}>
          <div className={styles.avatar}>{monogram(job.company.name)}</div>
          <div className={styles.titleCol}>
            <h1 className={styles.title}>{job.rawTitle}</h1>
            <p className={styles.company}>{job.company.name}</p>
          </div>
        </div>

        <div className={styles.tags}>
          {job.siteStates.length > 0 && (
            <span className={styles.tag}>
              <span className={`${styles.dot} ${styles.dotBlue}`} />
              {job.siteArrangement === "HYBRID" ? "Hybrid" : "Onsite"} ·{" "}
              {job.siteStates.join(", ")}
            </span>
          )}
          {job.remoteUs && (
            <span className={styles.tag}>
              <span className={`${styles.dot} ${styles.dotGreen}`} />
              {job.remoteScope === "STATE_LIST" && job.remoteStates.length > 0
                ? `Remote — ${job.remoteStates.join(", ")}`
                : "Remote (US)"}
            </span>
          )}
          <span className={salary ? styles.salaryTag : styles.salaryUnknownTag}>
            {salary ?? "Salary unknown / unpublished"}
          </span>
          {job.status === JobStatus.CLOSED && (
            <span className={styles.closedTag}>No longer listed</span>
          )}
        </div>

        <p className={styles.meta}>
          Posted {fmtDate(job.datePosted)} · First seen {fmtDate(job.firstSeen)} ·
          Last verified {fmtDate(job.lastVerified)}
          {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
        </p>

        <div className={styles.cta}>
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.viewBtn}
          >
            View job on {job.company.name} site ↗
          </a>
          <form action={saved ? removeSaved : saveJob}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton className={styles.saveBtn}>
              {saved ? "★ Saved" : "☆ Save"}
            </SubmitButton>
          </form>
        </div>

        <article className={styles.description}>{job.descriptionText}</article>
      </div>
    </div>
  );
}
