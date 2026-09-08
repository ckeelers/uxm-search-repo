import type { Company, Platform } from "@searchexperience/core";

/** One posting as pulled from a source, before any classification. */
export interface RawJob {
  externalId: string;
  sourceUrl: string;
  title: string;
  descriptionText: string;
  locationText?: string;
  /** Free text the salary parser reads — synthesised from structured fields when the source has them. */
  compText?: string;
  datePosted?: Date;
  /** ISO-2 country code when the source states one; lets the pipeline flag non-US roles the location text alone would miss. */
  countryHint?: string;
}

export interface Adapter {
  platform: Platform;
  /** All current postings for this company. Throws HttpError on a blocked fetch. */
  listJobs(company: Company): Promise<RawJob[]>;
}
