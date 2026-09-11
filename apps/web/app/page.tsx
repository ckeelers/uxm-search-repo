import Link from "next/link";
import { prisma, MatchOutcome, JobStatus } from "@searchexperience/core";
import type { Prisma } from "@searchexperience/core";
import { saveJob, removeSaved } from "./actions";
import { OWNER_ID } from "../lib/owner";
import { SubmitButton } from "./_components/submit-button";
import { RefreshingForm } from "./_components/refreshing-form";
import { SiteHeader } from "./_components/site-header";
import { ViewJobLink } from "./_components/view-job-link";
import { monogram } from "../lib/monogram";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function fmtDate(d: Date | null): string {
  return d
    ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "—";
}

function fmtBand(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return null;
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  return min === max ? k(min) : `${k(min)}–${k(max)}`;
}

async function getJobs(where: Prisma.JobWhereInput) {
  return prisma.job.findMany({
    where,
    orderBy: [{ datePosted: { sort: "desc", nulls: "last" } }, { firstSeen: "desc" }],
    include: { company: { select: { name: true } } },
    take: 300,
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim();
  const state = (one(sp.state) ?? "").toUpperCase();
  const salary = one(sp.salary) ?? "";

  const arrTouched = ["onsite", "hybrid", "remote"].some((k) => sp[k] !== undefined);
  const onsite = arrTouched ? one(sp.onsite) === "1" : true;
  const hybrid = arrTouched ? one(sp.hybrid) === "1" : true;
  const remote = arrTouched ? one(sp.remote) === "1" : true;
  const anyArr = onsite || hybrid || remote;

  const arrOr: Prisma.JobWhereInput[] = [];
  const sited = state ? { siteStates: { has: state } } : {};
  if (onsite) arrOr.push({ siteArrangement: "ONSITE", ...sited });
  if (hybrid) arrOr.push({ siteArrangement: "HYBRID", ...sited });
  if (remote) arrOr.push({ remoteUs: true });

  const and: Prisma.JobWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { rawTitle: { contains: q, mode: "insensitive" } },
        { company: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (anyArr) and.push({ OR: arrOr });

  const where: Prisma.JobWhereInput = {
    status: JobStatus.OPEN,
    matchOutcome: { in: [MatchOutcome.STAGE1_INCLUDE, MatchOutcome.STAGE2_INCLUDE] },
    ...(salary === "stated"
      ? { salaryState: "STATED" }
      : salary === "unknown"
        ? { salaryState: "UNKNOWN" }
        : {}),
    ...(and.length ? { AND: and } : {}),
  };

  let jobs: Awaited<ReturnType<typeof getJobs>> = [];
  let savedIds = new Set<string>();
  let savedCount = 0;
  let error = false;
  try {
    const [rows, saved] = await Promise.all([
      getJobs(where),
      prisma.savedJob.findMany({
        where: { userId: OWNER_ID },
        select: { jobId: true },
      }),
    ]);
    // new (unviewed) jobs float to the top; Array#sort is stable, so within
    // each group the existing datePosted/firstSeen order is untouched.
    jobs = rows
      .slice()
      .sort((a, b) => Number(a.viewedAt != null) - Number(b.viewedAt != null));
    savedIds = new Set(saved.map((s) => s.jobId));
    savedCount = saved.length;
  } catch {
    error = true;
  }

  const latestVerified =
    jobs.length > 0
      ? jobs.reduce(
          (max, j) => (j.lastVerified > max ? j.lastVerified : max),
          jobs[0]!.lastVerified,
        )
      : null;

  const isNew = (j: { viewedAt: Date | null }) => j.viewedAt == null;

  const arrToggle = (name: string, label: string, checked: boolean, dot: string) => (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className={styles.toggleInput}
      />
      <span className={`${styles.dot} ${dot}`} />
      <span className={styles.toggleText}>{label}</span>
      <svg className={styles.toggleCheck} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3 8.5l3.2 3.2L13 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  );

  return (
    <div className={styles.screen}>
      <SiteHeader savedCount={savedCount} />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>UX Manager · US only</p>
          <h1 className={styles.heroTitle}>Senior design leadership roles</h1>
        </div>
      </section>

      <div className={styles.body}>
        <div className={styles.columns}>
          <aside className={styles.sidebar}>
            <form method="GET" className={styles.filterCard}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Search</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Title or company…"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>State</span>
                <select name="state" defaultValue={state} className={styles.select}>
                  <option value="">Any</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Salary</span>
                <select name="salary" defaultValue={salary} className={styles.select}>
                  <option value="">Any</option>
                  <option value="stated">Band stated</option>
                  <option value="unknown">Unpublished</option>
                </select>
              </label>

              <div>
                <span className={styles.fieldLabel}>Arrangement</span>
                <div className={styles.toggleList}>
                  {arrToggle("onsite", "Onsite", onsite, styles.dotBlue)}
                  {arrToggle("hybrid", "Hybrid", hybrid, styles.dotBlue)}
                  {arrToggle("remote", "Remote", remote, styles.dotGreen)}
                </div>
              </div>

              <div className={styles.actions}>
                <button className={styles.btnPrimary}>Apply filters</button>
                <a href="/" className={styles.btnGhost}>
                  Clear filters
                </a>
              </div>
            </form>
          </aside>

          <div className={styles.results}>
            <div className={styles.resultsHead}>
              <p className={styles.count}>
                <span className={styles.countNum}>{jobs.length}</span>{" "}
                <span className={styles.countWord}>
                  role{jobs.length === 1 ? "" : "s"}
                </span>
              </p>
              {latestVerified && (
                <p className={styles.verified}>Verified {fmtDate(latestVerified)}</p>
              )}
            </div>

            {error ? (
              <p className={styles.error}>
                Couldn&apos;t load jobs — database unavailable.
              </p>
            ) : jobs.length === 0 ? (
              <p className={styles.empty}>No roles match. Try widening the filters.</p>
            ) : (
              <ul className={styles.list}>
                {jobs.map((job) => {
                  const band = fmtBand(job.salaryMin, job.salaryMax);
                  const isSaved = savedIds.has(job.id);
                  return (
                    <li key={job.id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardMain}>
                          <div className={styles.avatar}>
                            {monogram(job.company.name)}
                          </div>
                          <div className={styles.titleCol}>
                            <div className={styles.titleLine}>
                              {isNew(job) && (
                                <span className={styles.newBadge}>New!</span>
                              )}
                              <Link
                                href={`/jobs/${job.id}`}
                                prefetch={false}
                                className={styles.cardTitle}
                              >
                                {job.rawTitle}
                              </Link>
                            </div>
                            <p className={styles.company}>{job.company.name}</p>
                            <div className={styles.tags}>
                              {job.siteStates.length > 0 && (
                                <span className={styles.tag}>
                                  <span
                                    className={`${styles.dot} ${styles.dotBlue}`}
                                  />
                                  {job.siteArrangement === "HYBRID"
                                    ? "Hybrid"
                                    : "Onsite"}
                                </span>
                              )}
                              {job.siteStates.map((s) => (
                                <span key={s} className={styles.tag}>
                                  {s}
                                </span>
                              ))}
                              {job.remoteUs && (
                                <span className={styles.tag}>
                                  <span
                                    className={`${styles.dot} ${styles.dotGreen}`}
                                  />
                                  {job.remoteScope === "STATE_LIST" &&
                                  job.remoteStates.length > 0
                                    ? `Remote — ${job.remoteStates.join(", ")}`
                                    : "Remote (US)"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={styles.salaryCol}>
                          {band ? (
                            <span className={styles.salary}>{band}</span>
                          ) : (
                            <span className={styles.salaryUnknown}>
                              Salary unknown
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.cardFoot}>
                        <p className={styles.meta}>
                          Posted {fmtDate(job.datePosted)} · Seen{" "}
                          {fmtDate(job.firstSeen)}
                        </p>
                        <div className={styles.footActions}>
                          <RefreshingForm action={isSaved ? removeSaved : saveJob}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <SubmitButton className={styles.saveBtn}>
                              {isSaved ? "★ Saved" : "☆ Save"}
                            </SubmitButton>
                          </RefreshingForm>
                          <ViewJobLink
                            jobId={job.id}
                            href={job.sourceUrl}
                            className={styles.viewBtn}
                          >
                            View job ↗
                          </ViewJobLink>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
