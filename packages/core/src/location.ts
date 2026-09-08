import { SiteArrangement, RemoteScope } from "./types";

/**
 * Location classifier (plan §4.3).
 *
 * A posting can be sited in one or more US states AND offer US-remote at the
 * same time, so the result carries the two facets independently. Non-US-only
 * postings are flagged for the pipeline to drop.
 */

export interface LocationClass {
  isUsBased: boolean;
  siteStates: string[]; // 2-letter, de-duped
  siteArrangement: SiteArrangement;
  remoteUs: boolean;
  remoteScope: RemoteScope | null;
  remoteStates: string[];
}

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};
const ABBREVS = new Set(Object.values(US_STATES));

const METROS: Record<string, string> = {
  "san francisco bay area": "CA", "bay area": "CA", "silicon valley": "CA",
  "greater seattle": "WA", "new york city": "NY", "greater new york": "NY",
  nyc: "NY", "greater boston": "MA", "greater los angeles": "CA",
  "greater chicago": "IL", "washington, d.c.": "DC", "washington dc": "DC",
  "washington, dc": "DC", "research triangle": "NC",
};

// bare city names -> state, for strings like "San Francisco; Remote"
const CITIES: Record<string, string> = {
  "san francisco": "CA", "san jose": "CA", oakland: "CA", "palo alto": "CA",
  "mountain view": "CA", "menlo park": "CA", sunnyvale: "CA", "santa clara": "CA",
  "san mateo": "CA", "redwood city": "CA", "san diego": "CA", "los angeles": "CA",
  "santa monica": "CA", "culver city": "CA", irvine: "CA", pasadena: "CA",
  "new york": "NY", brooklyn: "NY", manhattan: "NY",
  seattle: "WA", bellevue: "WA", redmond: "WA",
  austin: "TX", dallas: "TX", houston: "TX", "san antonio": "TX",
  denver: "CO", boulder: "CO",
  boston: "MA", cambridge: "MA", somerville: "MA",
  chicago: "IL", atlanta: "GA",
  miami: "FL", orlando: "FL", tampa: "FL",
  philadelphia: "PA", pittsburgh: "PA",
  phoenix: "AZ", scottsdale: "AZ", tempe: "AZ",
  "salt lake city": "UT", minneapolis: "MN", detroit: "MI", nashville: "TN",
  charlotte: "NC", raleigh: "NC", durham: "NC", columbus: "OH",
  "las vegas": "NV", portland: "OR", "kansas city": "MO", "st. louis": "MO",
};

const NON_US =
  /\b(united kingdom|england|scotland|wales|ireland|canada|ontario|quebec|british columbia|germany|france|spain|portugal|netherlands|poland|india|singapore|australia|japan|brazil|mexico|emea|apac|latam|anz|uk|eu)\b/i;

const US_ONLY = /\b(united states|u\.s\.a?\.?|usa|us|remote)\b/i;

// role can be done remotely from the US, per the description body
const DESC_REMOTE_US =
  /(fully[-\s]remote|remote[-\s]first|100%\s*remote|work from anywhere in the (?:us|u\.s\.?|united states)|remotely (?:from|within|in|across) (?:the\s+)?(?:us|u\.s\.?|united states)|remote (?:in|within|from|across) (?:the\s+)?(?:us|u\.s\.?|united states)|hubs? or (?:work )?remotely|or (?:work )?remotely|remote \(us\)|\bus[-\s]remote\b)/i;

// description explicitly says the role is onsite-only — overrides the metadata
const ONSITE_ONLY_SIGNALS: RegExp[] = [
  /\bthis (?:role|position|job) (?:is|will be) (?:fully\s+)?(?:based\s+|located\s+)?(?:on-?site|in[-\s]office)\b/i,
  /\bon-?site (?:only|role|position)\b/i,
  /\b(?:must|required to|expected to|need to) (?:work|be) (?:on-?site|in[-\s]office|in (?:the|our) office|from (?:the|our) [a-z .,]{0,25}(?:office|hq|headquarters))\b/i,
  /\b(?:based|located|role is based) (?:out of |in )(?:our )?[a-z .,]{0,30}\b(?:hq|headquarters)\b/i,
  /\bremote (?:work )?(?:is )?not (?:available|offered|permitted|an option)\b/i,
  /\bnot (?:a |an )?(?:fully )?remote (?:role|position|job|opportunity)\b/i,
  /\bno remote (?:work|option)\b/i,
];

function saysOnsiteOnly(desc: string): boolean {
  if (ONSITE_ONLY_SIGNALS.some((re) => re.test(desc))) return true;
  // relocation assistance next to an HQ/office mention -> onsite expectation
  return (
    /\brelocation (?:assistance|support|package|benefits|reimbursement|is (?:available|offered|provided))\b/i.test(
      desc,
    ) && /\b(?:hq|headquarters|our [a-z ]{0,20}office)\b/i.test(desc)
  );
}

function extractState(part: string): string | null {
  const p = part.toLowerCase().trim();

  for (const [metro, st] of Object.entries(METROS)) {
    if (p.includes(metro)) return st;
  }
  // an explicit 2-letter code as its own token ("City, ST") — most reliable
  const codes = part.match(/\b([A-Z]{2})\b/g);
  if (codes) {
    for (const code of codes) if (ABBREVS.has(code)) return code;
  }
  // spelled-out state name
  for (const [name, abbr] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${name}\\b`).test(p)) return abbr;
  }
  // bare city name
  for (const [city, st] of Object.entries(CITIES)) {
    if (new RegExp(`\\b${city.replace(/\./g, "\\.")}\\b`).test(p)) return st;
  }
  return null;
}

function extractStates(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const [name, abbr] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) found.add(abbr);
  }
  const codes = text.match(/\b([A-Z]{2})\b/g) ?? [];
  for (const c of codes) if (ABBREVS.has(c)) found.add(c);
  return [...found];
}

function detectRemoteScope(
  haystack: string,
): { scope: RemoteScope; states: string[] } {
  const patterns = [
    /must (?:reside|be located|be based|live) in ([^.\n]{3,120})/i,
    /open to (?:candidates|applicants|employees|residents)[^.\n]*? in ([^.\n]{3,120})/i,
    /(?:hired|employment|work) (?:only )?(?:from|in) (?:the following states|these states|the states of)[:\s]+([^.\n]{3,120})/i,
    /residents of ([^.\n]{3,120})/i,
    /located in one of (?:the following|these)[^:.\n]*[:\s]+([^.\n]{3,120})/i,
  ];
  for (const re of patterns) {
    const m = haystack.match(re);
    if (m?.[1]) {
      const states = extractStates(m[1]);
      if (states.length > 0) return { scope: RemoteScope.STATE_LIST, states };
    }
  }
  return { scope: RemoteScope.ANYWHERE_US, states: [] };
}

export function classifyLocation(
  rawLocationText: string | null | undefined,
  descriptionText: string | null | undefined,
): LocationClass {
  const raw = (rawLocationText ?? "").trim();
  const desc = descriptionText ?? "";

  if (!raw) {
    // nothing to go on — least-restrictive default (spec risk table)
    return {
      isUsBased: true,
      siteStates: [],
      siteArrangement: SiteArrangement.UNKNOWN,
      remoteUs: false,
      remoteScope: null,
      remoteStates: [],
    };
  }

  const parts = raw
    .split(/\s*(?:;|•|\||\/{2,}|\bor\b|\n)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const siteStates = new Set<string>();
  let sawHybrid = false;
  let sawOnsite = false;
  let remoteUs = false;
  let sawUs = false;
  let sawNonUs = false;

  for (const part of parts) {
    const lower = part.toLowerCase();
    const isRemotePart = /\bremote\b|\bwork from home\b|\bwfh\b|\banywhere\b/.test(
      lower,
    );
    const isNonUs = NON_US.test(lower) && !/\bunited states\b|\bus\b|\busa\b/.test(lower);

    if (isRemotePart) {
      if (isNonUs) {
        sawNonUs = true;
      } else {
        remoteUs = true;
        sawUs = true;
      }
      continue;
    }

    if (/\bhybrid\b/.test(lower)) sawHybrid = true;
    else if (/\bon-?site\b|\bin[- ]office\b/.test(lower)) sawOnsite = true;

    const st = extractState(part);
    if (st) {
      siteStates.add(st);
      sawUs = true;
    } else if (isNonUs) {
      sawNonUs = true;
    } else if (US_ONLY.test(lower)) {
      sawUs = true;
    }
  }

  // reconcile the location metadata with what the description body says
  const descRemote = DESC_REMOTE_US.test(desc);
  if (!remoteUs && descRemote) {
    remoteUs = true;
    sawUs = true;
  }
  // an explicit onsite-only statement overrides "remote"/"hybrid" metadata,
  // unless the description also explicitly offers remote
  if (!descRemote && saysOnsiteOnly(desc)) {
    remoteUs = false;
    sawHybrid = false;
    sawOnsite = true;
  }

  // arrangement: hybrid beats onsite; a physical site with no keyword => onsite
  let siteArrangement: SiteArrangement;
  if (sawHybrid) siteArrangement = SiteArrangement.HYBRID;
  else if (sawOnsite || siteStates.size > 0) siteArrangement = SiteArrangement.ONSITE;
  else siteArrangement = SiteArrangement.UNKNOWN;

  let remoteScope: RemoteScope | null = null;
  let remoteStates: string[] = [];
  if (remoteUs) {
    const found = detectRemoteScope(`${raw}\n${desc}`);
    remoteScope = found.scope;
    remoteStates = found.states;
  }

  return {
    isUsBased: sawUs ? true : !sawNonUs,
    siteStates: [...siteStates],
    siteArrangement,
    remoteUs,
    remoteScope,
    remoteStates,
  };
}
