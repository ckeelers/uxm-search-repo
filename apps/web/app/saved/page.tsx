import Link from "next/link";
import { prisma, JobStatus, SavedStatus, Track } from "@searchexperience/core";
import { removeSaved, setSavedStatus, setSavedNotes } from "../actions";
import { OWNER_ID } from "../../lib/owner";

export const dynamic = "force-dynamic";

const TRACK_LABEL: Record<Track, string> = {
  UX_DESIGN_MGR: "UX / Design Manager",
  UX_RESEARCH_MGR: "UX Research Manager",
};

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
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Saved roles</h1>
        <Link
          href="/"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          ← Search
        </Link>
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load saved roles — database unavailable.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          Nothing saved yet. Hit ☆ Save on a role.
        </p>
      ) : (
        GROUPS.map(({ status, label }) => {
          const group = rows.filter((r) => r.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="mb-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                {label} ({group.length})
              </h2>
              <ul className="divide-y divide-neutral-200">
                {group.map(({ job, notes }) => (
                  <li key={job.id} className="py-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                        {job.rawTitle}
                      </Link>
                      <span className="text-neutral-500">· {job.company.name}</span>
                      {job.track && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                          {TRACK_LABEL[job.track]}
                        </span>
                      )}
                      {job.status === JobStatus.CLOSED && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                          No longer listed
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-xs text-neutral-400">
                      Posted {fmtDate(job.datePosted)} · Verified{" "}
                      {fmtDate(job.lastVerified)}
                      {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Apply ↗
                      </a>
                      {GROUPS.filter((g) => g.status !== status).map((g) => (
                        <form key={g.status} action={setSavedStatus}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="status" value={g.status} />
                          <button className="text-neutral-500 hover:text-neutral-900 hover:underline">
                            → {g.label}
                          </button>
                        </form>
                      ))}
                      <form action={removeSaved}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <button className="text-red-500 hover:underline">Remove</button>
                      </form>
                    </div>

                    <form
                      action={setSavedNotes}
                      className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end"
                    >
                      <input type="hidden" name="jobId" value={job.id} />
                      <textarea
                        name="notes"
                        rows={2}
                        defaultValue={notes ?? ""}
                        placeholder="Notes…"
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <button className="shrink-0 rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">
                        Save note
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
