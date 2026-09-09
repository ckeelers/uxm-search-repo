import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, JobStatus, Track } from "@searchexperience/core";
import { saveJob, removeSaved } from "../../actions";
import { OWNER_ID } from "../../../lib/owner";
import { SubmitButton } from "../../_components/submit-button";

export const dynamic = "force-dynamic";

const TRACK_LABEL: Record<Track, string> = {
  UX_DESIGN_MGR: "UX / Design Manager",
  UX_RESEARCH_MGR: "UX Research Manager",
};

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
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Search
      </Link>

      <h1 className="mt-3 text-xl font-semibold">{job.rawTitle}</h1>
      <p className="text-neutral-500">{job.company.name}</p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {job.track && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
            {TRACK_LABEL[job.track]}
          </span>
        )}
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
            salary ? "bg-neutral-100 text-neutral-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {salary ?? "Salary unknown / unpublished"}
        </span>
        {job.status === JobStatus.CLOSED && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
            No longer listed
          </span>
        )}
      </div>

      <div className="mt-2 text-xs text-neutral-400">
        Posted {fmtDate(job.datePosted)} · First seen {fmtDate(job.firstSeen)} · Last
        verified {fmtDate(job.lastVerified)}
        {job.rawLocationText ? ` · ${job.rawLocationText}` : ""}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Apply on {job.company.name} site ↗
        </a>
        <form action={saved ? removeSaved : saveJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <SubmitButton className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
            {saved ? "★ Saved" : "☆ Save"}
          </SubmitButton>
        </form>
      </div>

      <article className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
        {job.descriptionText}
      </article>
    </main>
  );
}
