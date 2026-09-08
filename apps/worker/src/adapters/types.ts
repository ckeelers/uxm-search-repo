import type { Company, Platform } from "@searchexperience/core";

/** One posting as pulled from a source, before any classification. */
export interface RawJob {
  externalId: string;
  sourceUrl: string;
  title: string;
  descriptionText: string;
  locationText?: string;
  compText?: string;
  datePosted?: Date;
}

export interface Adapter {
  platform: Platform;
  /** All current postings for this company. Throws HttpError on a blocked fetch. */
  listJobs(company: Company): Promise<RawJob[]>;
}
