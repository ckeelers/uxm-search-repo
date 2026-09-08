import { Platform, type Company } from "@searchexperience/core";
import { getJson, postJson, htmlToText } from "../http";
import type { Adapter, RawJob } from "./types";

interface WdListItem {
  title: string;
  externalPath: string;
  locationsText?: string;
}
interface WdListResponse {
  total?: number;
  jobPostings?: WdListItem[];
}
type WdCountry = string | { descriptor?: string } | undefined;
interface WdDetail {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    startDate?: string;
    remoteType?: string;
    jobReqId?: string;
    externalUrl?: string;
    country?: WdCountry;
  };
}

// Searched server-side so we don't page hundreds of listings. Broad on purpose;
// the real taxonomy still runs in the pipeline.
const SEARCHES = [
  "design manager",
  "ux manager",
  "user experience",
  "ux research",
  "research manager",
];

// loose title gate, only to bound the number of detail fetches
const TITLE_PRE = /\b(design|ux|user experience|research|experience)\b/i;
const TITLE_LEAD = /\b(manager|management|lead|head|director)\b/i;
const MAX_DETAILS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function usCountry(c: WdCountry): string | undefined {
  const s = typeof c === "string" ? c : c?.descriptor;
  if (!s) return undefined;
  return /united states|u\.?s\.?a?\b/i.test(s) ? "US" : s;
}

/**
 * Workday CXS JSON API. `platformId` is "<tenant>/<wd>/<site>", e.g.
 * "adobe/wd5/external_experienced" -> base
 * https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced
 */
export const workdayAdapter: Adapter = {
  platform: Platform.WORKDAY,

  async listJobs(company: Company): Promise<RawJob[]> {
    const [tenant, wd, site] = (company.platformId ?? "").split("/");
    if (!tenant || !wd || !site) {
      throw new Error(`${company.slug}: platformId must be "<tenant>/<wd>/<site>"`);
    }
    const base = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}`;

    const found = new Map<string, WdListItem>();
    for (const searchText of SEARCHES) {
      const res = await postJson<WdListResponse>(`${base}/jobs`, {
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText,
      });
      for (const p of res.jobPostings ?? []) {
        if (p.externalPath && !found.has(p.externalPath)) found.set(p.externalPath, p);
      }
      await sleep(200);
    }

    const candidates = [...found.values()]
      .filter((p) => TITLE_PRE.test(p.title) && TITLE_LEAD.test(p.title))
      .slice(0, MAX_DETAILS);

    const out: RawJob[] = [];
    for (const p of candidates) {
      let detail: WdDetail;
      try {
        detail = await getJson<WdDetail>(`${base}${p.externalPath}`);
      } catch {
        continue; // skip a single bad detail, keep the rest
      }
      const info = detail.jobPostingInfo ?? {};
      const desc = htmlToText(info.jobDescription ?? "");
      const locs = [info.location, ...(info.additionalLocations ?? [])].filter(
        (s): s is string => !!s && s.trim().length > 0,
      );
      out.push({
        externalId: info.jobReqId || p.externalPath,
        sourceUrl:
          info.externalUrl ||
          `https://${tenant}.${wd}.myworkdayjobs.com/${site}${p.externalPath}`,
        title: info.title || p.title,
        descriptionText: desc,
        locationText: [locs.join("; "), info.remoteType].filter(Boolean).join("; "),
        compText: desc,
        datePosted: info.startDate ? new Date(info.startDate) : undefined,
        countryHint: usCountry(info.country),
      });
      await sleep(250);
    }
    return out;
  },
};
