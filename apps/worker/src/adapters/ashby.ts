import { Platform, type Company } from "@searchexperience/core";
import { getJson } from "../http";
import type { Adapter, RawJob } from "./types";

interface AshbyComp {
  summaryComponents?: Array<{
    compensationType?: string;
    interval?: string;
    currencyCode?: string | null;
    minValue?: number | null;
    maxValue?: number | null;
  }>;
  scrapeableCompensationSalarySummary?: string | null;
}

interface AshbyJob {
  id: string;
  title: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string | null;
  address?: { postalAddress?: { addressCountry?: string } };
  compensation?: AshbyComp | null;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

const INTERVAL_WORD: Record<string, string> = {
  "1 YEAR": "per year",
  "1 MONTH": "per month",
  "1 HOUR": "per hour",
};

/** Turn Ashby's structured salary into text the parser understands. */
function compText(job: AshbyJob): string | undefined {
  const salary = job.compensation?.summaryComponents?.find(
    (c) => c.compensationType === "Salary",
  );
  if (
    salary?.currencyCode === "USD" &&
    salary.minValue != null &&
    salary.maxValue != null
  ) {
    const per = INTERVAL_WORD[salary.interval ?? "1 YEAR"] ?? "per year";
    return `Base salary range: $${salary.minValue} - $${salary.maxValue} ${per}.`;
  }
  const summary = job.compensation?.scrapeableCompensationSalarySummary;
  if (summary) return `Base salary range: ${summary}.`;
  return job.descriptionPlain;
}

function locationText(job: AshbyJob): string {
  const parts = [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => s.trim());
  if (job.isRemote && !parts.some((p) => /remote/i.test(p))) {
    parts.push("Remote");
  }
  if (job.workplaceType && !parts.some((p) => new RegExp(job.workplaceType!, "i").test(p))) {
    parts.push(job.workplaceType);
  }
  return parts.join("; ");
}

/**
 * Ashby job-board API. `platformId` is the board name in the URL
 * (jobs.ashbyhq.com/<name>). One GET returns everything, with structured
 * compensation when the company publishes it.
 */
export const ashbyAdapter: Adapter = {
  platform: Platform.ASHBY,

  async listJobs(company: Company): Promise<RawJob[]> {
    const name = company.platformId?.trim();
    if (!name) throw new Error(`${company.slug}: platformId (board name) is required`);

    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
      name,
    )}?includeCompensation=true`;
    const data = await getJson<AshbyResponse>(url);

    return (data.jobs ?? []).map((j): RawJob => {
      const country = j.address?.postalAddress?.addressCountry;
      return {
        externalId: j.id,
        sourceUrl: j.jobUrl ?? j.applyUrl ?? "",
        title: j.title.trim(),
        descriptionText: j.descriptionPlain ?? j.descriptionHtml ?? "",
        locationText: locationText(j),
        compText: compText(j),
        datePosted: j.publishedAt ? new Date(j.publishedAt) : undefined,
        countryHint:
          country && /^(usa|united states|us)$/i.test(country) ? "US" : undefined,
      };
    });
  },
};
