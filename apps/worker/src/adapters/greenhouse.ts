import { Platform, type Company } from "@searchexperience/core";
import { getJson, htmlToText } from "../http";
import type { Adapter, RawJob } from "./types";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  content: string;
  location?: { name?: string } | null;
  first_published?: string | null;
  updated_at?: string | null;
}

interface GhResponse {
  jobs: GhJob[];
}

/**
 * Greenhouse job-board API. `platformId` is the board token (e.g. "stripe" for
 * boards-api.greenhouse.io/v1/boards/stripe/jobs). One request returns every
 * posting with full content. Field mapping verified against live data
 * (plans/m1-seed-companies.md).
 */
export const greenhouseAdapter: Adapter = {
  platform: Platform.GREENHOUSE,

  async listJobs(company: Company): Promise<RawJob[]> {
    const token = company.platformId?.trim();
    if (!token) {
      throw new Error(`${company.slug}: platformId (board token) is required`);
    }

    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
      token,
    )}/jobs?content=true`;
    const data = await getJson<GhResponse>(url);

    return data.jobs.map((j): RawJob => {
      const descriptionText = htmlToText(j.content ?? "");
      return {
        externalId: String(j.id),
        sourceUrl: j.absolute_url,
        title: j.title,
        descriptionText,
        locationText: j.location?.name ?? undefined,
        // US pay-transparency: the band, when present, lives in the body text.
        compText: descriptionText,
        datePosted: j.first_published ? new Date(j.first_published) : undefined,
      };
    });
  },
};
