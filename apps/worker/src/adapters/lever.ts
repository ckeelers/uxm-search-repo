import { Platform, type Company } from "@searchexperience/core";
import { getJson } from "../http";
import type { Adapter, RawJob } from "./types";

interface LeverJob {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  createdAt?: number;
  workplaceType?: string;
  country?: string;
  categories?: {
    location?: string;
    allLocations?: string[];
    commitment?: string;
  };
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  } | null;
}

const INTERVAL_WORD: Record<string, string> = {
  "per-year-salary": "per year",
  "per-month-salary": "per month",
  "per-hour-wage": "per hour",
};

function compText(job: LeverJob): string | undefined {
  const s = job.salaryRange;
  if (s?.currency === "USD" && s.min != null && s.max != null) {
    const per = INTERVAL_WORD[s.interval ?? ""] ?? "per year";
    return `Base salary range: $${s.min} - $${s.max} ${per}.`;
  }
  return [job.descriptionPlain, job.additionalPlain].filter(Boolean).join("\n\n");
}

function locationText(job: LeverJob): string {
  const locs =
    job.categories?.allLocations?.length
      ? job.categories.allLocations
      : job.categories?.location
        ? [job.categories.location]
        : [];
  const parts = locs.map((s) => s.trim()).filter(Boolean);
  if (job.workplaceType) parts.push(job.workplaceType);
  return parts.join("; ");
}

/**
 * Lever postings API. `platformId` is the company slug in the URL
 * (jobs.lever.co/<slug>). Returns a plain array.
 */
export const leverAdapter: Adapter = {
  platform: Platform.LEVER,

  async listJobs(company: Company): Promise<RawJob[]> {
    const slug = company.platformId?.trim();
    if (!slug) throw new Error(`${company.slug}: platformId (company slug) is required`);

    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
      slug,
    )}?mode=json`;
    const data = await getJson<LeverJob[]>(url);

    return (data ?? []).map((j): RawJob => ({
      externalId: j.id,
      sourceUrl: j.hostedUrl ?? j.applyUrl ?? "",
      title: j.text,
      descriptionText: [j.descriptionPlain, j.additionalPlain]
        .filter(Boolean)
        .join("\n\n"),
      locationText: locationText(j),
      compText: compText(j),
      datePosted: j.createdAt ? new Date(j.createdAt) : undefined,
      countryHint: j.country ? j.country.toUpperCase() : undefined,
    }));
  },
};
