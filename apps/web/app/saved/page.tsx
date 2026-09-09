import { prisma, JobStatus, SavedStatus } from "@searchexperience/core";
import { removeSaved, setSavedStatus, setSavedNotes } from "../actions";
import { OWNER_ID } from "../../lib/owner";
import { SubmitButton } from "../_components/submit-button";
import { SiteHeader } from "../_components/site-header";
import { monogram } from "../../lib/monogram";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const GROUPS: { status: SavedStatus; label: string }[] = [
  { status: SavedStatus.SAVED, label: "Saved" },
  { status: SavedStatus.APPLIED, label: "Applied" },
];

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

export default async function SavedPage() {
  let rows: Awaited<ReturnType<typeof getSaved>> = [];
  let error = false;
  try {
    rows = await getSaved();
  } catch {
    error = true;
  }

  return (
    <div className={styles.screen}>
      <SiteHeader savedCount={rows.length} />

      <div className={styles.body}>
        <h1 className={styles.title}>Saved roles</h1>

        {error ? (
          <p className={styles.error}>
            Couldn&apos;t load saved roles — database unavailable.
          </p>
        ) : rows.length === 0 ? (
          <p className={styles.empty}>Nothing saved yet. Hit ☆ Save on a role.</p>
        ) : (
          GROUPS.map(({ status, label }) => {
            const group = rows.filter((r) => r.status === status);
            if (group.length === 0) return null;
            return (
              <section key={status} className={styles.group}>
                <h2 className={styles.groupLabel}>
                  {label} ({group.length})
                </h2>
                <ul className={styles.list}>
                  {group.map(({ job, notes }) => (
                    <li key={job.id} className={styles.card}>
                      <div className={styles.avatar}>
                        {monogram(job.company.name)}
                      </div>
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
                          Posted {fmtDate(job.datePosted)} · Seen{" "}
                          {fmtDate(job.firstSeen)} · Verified{" "}
                          {fmtDate(job.lastVerified)}
                          {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
                        </p>

                        <div className={styles.actions}>
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.link}
                          >
                            View job ↗
                          </a>
                          {GROUPS.filter((g) => g.status !== status).map((g) => (
                            <form key={g.status} action={setSavedStatus}>
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="status" value={g.status} />
                              <SubmitButton className={styles.linkMuted}>
                                → {g.label}
                              </SubmitButton>
                            </form>
                          ))}
                          <form action={removeSaved}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <SubmitButton className={styles.linkDanger}>
                              Remove
                            </SubmitButton>
                          </form>
                        </div>

                        <form action={setSavedNotes} className={styles.noteForm}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <textarea
                            name="notes"
                            rows={2}
                            defaultValue={notes ?? ""}
                            placeholder="Notes…"
                            className={styles.textarea}
                          />
                          <SubmitButton className={styles.noteBtn}>
                            Save note
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
