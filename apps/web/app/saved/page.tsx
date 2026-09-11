import Link from "next/link";
import { prisma, JobStatus, SavedStatus } from "@searchexperience/core";
import { removeSaved, setSavedStatus } from "../actions";
import { OWNER_ID } from "../../lib/owner";
import { SubmitButton } from "../_components/submit-button";
import { SiteHeader } from "../_components/site-header";
import { ViewJobLink } from "../_components/view-job-link";
import { monogram } from "../../lib/monogram";
import { NoteEditor } from "./note-editor";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function fmtDate(d: Date | null): string {
  return d
    ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "—";
}

async function getSaved() {
  return prisma.savedJob.findMany({
    where: { userId: OWNER_ID },
    orderBy: { updatedAt: "desc" },
    include: { job: { include: { company: { select: { name: true } } } } },
  });
}

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: SavedStatus =
    tabParam === "applied" ? SavedStatus.APPLIED : SavedStatus.SAVED;

  let rows: Awaited<ReturnType<typeof getSaved>> = [];
  let error = false;
  try {
    rows = await getSaved();
  } catch {
    error = true;
  }

  const savedRows = rows.filter((r) => r.status === SavedStatus.SAVED);
  const appliedRows = rows.filter((r) => r.status === SavedStatus.APPLIED);
  const shown = tab === SavedStatus.APPLIED ? appliedRows : savedRows;

  return (
    <div className={styles.screen}>
      <SiteHeader savedCount={savedRows.length} />

      <div className={styles.body}>
        <h1 className={styles.title}>Saved roles</h1>

        <nav className={styles.tabs}>
          <Link
            href="/saved"
            className={tab === SavedStatus.SAVED ? styles.tabActive : styles.tab}
          >
            Saved ({savedRows.length})
          </Link>
          <Link
            href="/saved?tab=applied"
            className={tab === SavedStatus.APPLIED ? styles.tabActive : styles.tab}
          >
            Applied ({appliedRows.length})
          </Link>
        </nav>

        {error ? (
          <p className={styles.error}>
            Couldn&apos;t load saved roles — database unavailable.
          </p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>
            {tab === SavedStatus.APPLIED
              ? "Nothing here yet. Move a saved role to Applied when you apply."
              : "Nothing saved yet. Hit ☆ Save on a role."}
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map(({ job, notes }) => (
              <li key={job.id} className={styles.card}>
                <div className={styles.avatar}>{monogram(job.company.name)}</div>
                <div className={styles.main}>
                  <div className={styles.titleRow}>
                    <a href={`/jobs/${job.id}`} className={styles.jobTitle}>
                      {job.rawTitle}
                    </a>
                    <span className={styles.company}>{job.company.name}</span>
                    {job.status === JobStatus.CLOSED && (
                      <span className={styles.closedTag}>No longer listed</span>
                    )}
                  </div>

                  <p className={styles.meta}>
                    Posted {fmtDate(job.datePosted)} · Seen {fmtDate(job.firstSeen)} ·
                    Verified {fmtDate(job.lastVerified)}
                    {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
                  </p>

                  <div className={styles.actions}>
                    <ViewJobLink jobId={job.id} href={job.sourceUrl} className={styles.link}>
                      View job ↗
                    </ViewJobLink>
                    {tab === SavedStatus.SAVED ? (
                      <form action={setSavedStatus}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="status" value={SavedStatus.APPLIED} />
                        <SubmitButton className={styles.linkMuted}>
                          → Applied
                        </SubmitButton>
                      </form>
                    ) : (
                      <form action={setSavedStatus}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="status" value={SavedStatus.SAVED} />
                        <SubmitButton className={styles.linkMuted}>
                          ↩ Restore to saved
                        </SubmitButton>
                      </form>
                    )}
                    <form action={removeSaved}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <SubmitButton className={styles.linkDanger}>Remove</SubmitButton>
                    </form>
                  </div>

                  <NoteEditor jobId={job.id} note={notes} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
