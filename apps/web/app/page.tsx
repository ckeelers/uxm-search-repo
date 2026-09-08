import Link from "next/link";
import { prisma, MatchOutcome, JobStatus, Track } from "@searchexperience/core";
import type { Prisma } from "@searchexperience/core";
import { saveJob, removeSaved } from "./actions";
import { OWNER_ID } from "../lib/owner";

export const dynamic = "force-dynamic";

const TRACK_LABEL: Record<Track, string> = {
  UX_DESIGN_MGR: "UX / Design Manager",
  UX_RESEARCH_MGR: "UX Research Manager",
};

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
  const track = one(sp.track) ?? "";
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
    ...(track ? { track: track as Track } : {}),
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
    jobs = rows;
    savedIds = new Set(saved.map((s) => s.jobId));
    savedCount = saved.length;
  } catch {
    error = true;
  }

  const cb = (name: string, label: string, checked: boolean) => (
    <label className="inline-flex items-center gap-1.5 text-sm">
      <input type="checkbox" name={name} value="1" defaultChecked={checked} />
      {label}
    </label>
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">searchexperience</h1>
          <p className="mt-1 text-sm text-neutral-500">
            UX Manager roles from company career pages — base band midpoint ≥
            $150k or unpublished, US only.
          </p>
        </div>
        <Link
          href="/saved"
          className="shrink-0 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Saved{savedCount ? ` (${savedCount})` : ""}
        </Link>
      </header>

      <form
        method="GET"
        className="mb-6 grid gap-3 rounded-lg border border-neutral-200 p-4 text-sm sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Keyword</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="title or company"
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Track</span>
          <select name="track" defaultValue={track} className="rounded border border-neutral-300 px-2 py-1">
            <option value="">Any</option>
            <option value="UX_DESIGN_MGR">UX / Design Manager</option>
            <option value="UX_RESEARCH_MGR">UX Research Manager</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">State</span>
          <select name="state" defaultValue={state} className="rounded border border-neutral-300 px-2 py-1">
            <option value="">Any</option>
            {STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-500">Salary</span>
          <select name="salary" defaultValue={salary} className="rounded border border-neutral-300 px-2 py-1">
            <option value="">Any</option>
            <option value="stated">Band stated</option>
            <option value="unknown">Unpublished</option>
          </select>
        </label>
        <div className="flex items-center gap-4 sm:col-span-2">
          <span className="text-neutral-500">Arrangement</span>
          {cb("onsite", "Onsite", onsite)}
          {cb("hybrid", "Hybrid", hybrid)}
          {cb("remote", "Remote", remote)}
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
            Filter
          </button>
          <a href="/" className="px-3 py-1.5 text-sm text-neutral-500 hover:underline">
            Reset
          </a>
        </div>
      </form>

      {error ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load jobs — database unavailable.
        </p>
      ) : jobs.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          No roles match. Try widening the filters.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-neutral-500">
            {jobs.length} role{jobs.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-neutral-200">
            {jobs.map((job) => {
              const band = fmtBand(job.salaryMin, job.salaryMax);
              return (
                <li key={job.id} className="py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-medium hover:underline"
                    >
                      {job.rawTitle}
                    </Link>
                    <span className="text-neutral-500">· {job.company.name}</span>
                    {job.track && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                        {TRACK_LABEL[job.track]}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {job.siteStates.length > 0 && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                        {job.siteArrangement === "HYBRID" ? "Hybrid" : "Onsite"} ·{" "}
                        {job.siteStates.join(", ")}
                      </span>
                    )}
                    {job.remoteUs && (
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">
                        {job.remoteScope === "STATE_LIST" && job.remoteStates.length > 0
                          ? `Remote — ${job.remoteStates.join(", ")}`
                          : "Remote: anywhere (US)"}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        band ? "bg-neutral-100 text-neutral-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {band ?? "Salary unknown / unpublished"}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-neutral-400">
                    Posted {fmtDate(job.datePosted)} · Seen {fmtDate(job.firstSeen)} ·
                    Verified {fmtDate(job.lastVerified)}
                    {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
                  </div>

                  <div className="mt-1 flex items-center gap-3">
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Apply on {job.company.name} site ↗
                    </a>
                    <form action={savedIds.has(job.id) ? removeSaved : saveJob}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <button className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
                        {savedIds.has(job.id) ? "★ Saved" : "☆ Save"}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
