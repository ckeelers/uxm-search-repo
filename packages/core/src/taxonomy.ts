import { Track } from "./types";

/**
 * Title taxonomy — Stage 1 (plan §4.1).
 *
 * normalizeTitle() cleans a raw job title; matchTitle() decides whether that
 * title is a UX-Manager-track role, a borderline case for human review, or a
 * reject. Stage 2 (description content check) lands in M4.
 *
 * The rules are expected to change as real data comes in — keep them here,
 * keep the tests next door.
 */

// --- constants ---------------------------------------------------------------

/** Leading words we strip: seniority / scope modifiers that never change the match. */
const LEADING_MODIFIERS = [
  "senior",
  "sr",
  "junior",
  "jr",
  "staff",
  "principal",
  "lead", // only stripped as a *leading* word; "Design Lead" keeps it
  "group",
  "global",
  "regional",
  "associate",
  "deputy",
];

/** Standalone titles that are a different discipline — reject on sight. */
const DISQUALIFIERS = [
  "product manager",
  "program manager",
  "project manager",
  "engineering manager",
  "product marketing manager",
  "product marketing",
  "partner manager",
  "account manager",
  "sales manager",
  "marketing manager",
  "community manager",
  "delivery manager",
  "portfolio manager",
  "operations manager",
  "office manager",
];

/** Tier above "manager" — deferred to a later spec (plan §4, decision 3). */
const ABOVE_MANAGER = /\b(director|vice president|vp|chief|head of)\b/;

/** A different function entirely — reject even when a design word also appears. */
const WRONG_FUNCTION =
  /\b(software|engineering|data science|machine learning|analytics|sales|revenue|procurement|hardware|mechanical|electrical|civil|firmware|devops|infrastructure engineer)\b/;

/** A specific UX/design-leadership discipline (auto-include when paired with leadership). */
const STRONG_DISCIPLINE =
  /\b(ux|user experience|product design|experience design|interaction design|design systems?|ux research|user research|experience research)\b/;

/** Bare "design" — real, but ambiguous (could be brand/marketing). Routes to review. */
const WEAK_DISCIPLINE = /\bdesign\b/;

/** People-leadership signal at manager level. */
const LEADERSHIP = /\b(manager|management|lead)\b/;

const RESEARCH_HINT = /\bresearch\b/;

// --- normalizeTitle --------------------------------------------------------

/** Bare leadership words that, before a comma, signal an inverted title. */
const BARE_LEADERSHIP =
  /^(manager|management|director|head of|head|vp|vice president|lead)$/;

/** A short discipline qualifier that, after a comma, belongs in front of the title. */
const DISCIPLINE_TAIL =
  /^(ux|ui|ux ui|ui ux|user experience|ux research|user research|ux design|product design|experience design|interaction design|design systems?|design|research)$/;

export function normalizeTitle(raw: string): string {
  let s = (raw ?? "").toLowerCase();

  // drop parenthetical / bracketed chunks: "(Remote)", "[Contract]"
  s = s.replace(/[([{][^)\]}]*[)\]}]/g, " ");

  // slashes and ampersands become spaces: "ux/ui" -> "ux ui", "design & research"
  s = s.replace(/[/&]+/g, " ");

  // resolve the comma: un-invert "Manager, UX" / "Research Manager, UX", or
  // drop a trailing business-scope clause ("Product Design Manager, Payments").
  s = uninvertOrTrimScope(s);

  // strip trailing level markers: "Manager II", "Designer 2", "Manager - L3"
  s = s.replace(/[\s,-]+(l\d|lvl\s*\d|level\s*\d|[ivx]{1,4}|\d)\s*$/i, " ");

  // collapse punctuation to spaces, squeeze whitespace
  s = s.replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ").trim();

  // strip leading modifier words, repeatedly ("senior staff ux manager")
  const words = s.split(" ");
  while (words.length > 1 && LEADING_MODIFIERS.includes(words[0]!)) {
    words.shift();
  }
  return words.join(" ").trim();
}

function uninvertOrTrimScope(s: string): string {
  const comma = s.indexOf(",");
  if (comma === -1) return s;

  const head = s.slice(0, comma).trim();
  const tail = s.slice(comma + 1).trim();

  // "Manager, UX Design" -> "UX Design Manager"
  if (BARE_LEADERSHIP.test(head)) return `${tail} ${head}`;

  // "Research Manager, UX" -> "UX Research Manager"
  if (DISCIPLINE_TAIL.test(tail)) return `${tail} ${head}`;

  // otherwise the comma introduces business scope — keep the head
  return head;
}

// --- matchTitle ------------------------------------------------------------

export type TitleOutcome = "STAGE1_INCLUDE" | "REVIEW_QUEUE" | "REJECTED";

export interface TitleMatch {
  outcome: TitleOutcome;
  track?: Track;
  reason?: string;
}

export function matchTitle(normalized: string): TitleMatch {
  const n = normalized.trim();
  if (!n) return { outcome: "REJECTED", reason: "empty-title" };

  // 1. above-manager tier is out for v1
  if (ABOVE_MANAGER.test(n)) {
    return { outcome: "REJECTED", reason: "above-manager-tier" };
  }

  // 1b. a different function — reject even if a "design" word rode along
  if (WRONG_FUNCTION.test(n)) {
    return { outcome: "REJECTED", reason: "wrong-function" };
  }

  // 2. disqualifiers — a different discipline entirely
  for (const dq of DISQUALIFIERS) {
    if (n.includes(dq)) {
      if (/\bux product manager\b|\buser experience product manager\b/.test(n)) {
        return {
          outcome: "REVIEW_QUEUE",
          reason: "ux-product-manager",
          track: Track.UX_DESIGN_MGR,
        };
      }
      return { outcome: "REJECTED", reason: `disqualified:${dq}` };
    }
  }

  // 3. must have a people-leadership signal
  if (!LEADERSHIP.test(n)) {
    return { outcome: "REJECTED", reason: "no-leadership-token" };
  }

  // 4. a specific UX/design discipline -> include
  if (STRONG_DISCIPLINE.test(n)) {
    const track = RESEARCH_HINT.test(n)
      ? Track.UX_RESEARCH_MGR
      : Track.UX_DESIGN_MGR;
    return { outcome: "STAGE1_INCLUDE", track };
  }

  // 5. bare "design" leadership -> human review (brand/marketing design?)
  if (WEAK_DISCIPLINE.test(n)) {
    return {
      outcome: "REVIEW_QUEUE",
      reason: "bare-design-title",
      track: Track.UX_DESIGN_MGR,
    };
  }

  // 6. bare "research" leadership -> human review (UX research vs market research?)
  if (RESEARCH_HINT.test(n)) {
    return {
      outcome: "REVIEW_QUEUE",
      reason: "bare-research-title",
      track: Track.UX_RESEARCH_MGR,
    };
  }

  return { outcome: "REJECTED", reason: "no-discipline-token" };
}

// --- Stage 2: content check (borderline titles only) ---------------------

const CORROBORATING = [
  /manage(?:s|d|r of)?\s+(?:a\s+)?(?:team of\s+)?designers?/i,
  /(?:lead|leading|leads)\s+(?:a\s+)?(?:team of\s+)?designers?/i,
  /design (?:reviews?|critiques?|crits)/i,
  /(?:hiring|recruit(?:ing)?|growing)\s+(?:the\s+)?design/i,
  /\bux\/ui\b/i,
  /\busability\b/i,
  /\buser research\b/i,
  /\bfigma\b/i,
  /\binteraction design\b/i,
  /\bdesign system\b/i,
  /\byears\b[^.]{0,40}\b(?:managing|leading)\b[^.]{0,20}\bdesign/i,
  /people management/i,
  /career (?:growth|development) of (?:your |the )?(?:team|designers)/i,
];

const ANTI_SIGNALS = [
  /own(?:s|ing)? the product roadmap/i,
  /backlog (?:prioriti[sz]ation|grooming)/i,
  /go-to-market/i,
  /\bp&l\b/i,
  /define (?:the )?product strategy/i,
  /revenue (?:targets|goals|growth)/i,
  /sprint planning/i,
];

export interface ContentCheck {
  score: number;
  corroborating: number;
  anti: number;
  decision: "auto-include" | "review" | "reject";
}

/**
 * Scan a borderline role's description for design-leadership signal vs
 * product-management noise. Only meaningful for REVIEW_QUEUE titles.
 */
export function contentCheck(descriptionText: string): ContentCheck {
  const text = descriptionText ?? "";
  const corroborating = CORROBORATING.filter((re) => re.test(text)).length;
  const anti = ANTI_SIGNALS.filter((re) => re.test(text)).length;
  const score = corroborating - anti;

  let decision: ContentCheck["decision"];
  if (score >= 2 && anti === 0) decision = "auto-include";
  else if (score <= -1 || (anti >= 2 && corroborating === 0)) decision = "reject";
  else decision = "review";

  return { score, corroborating, anti, decision };
}

/** Convenience: normalize + match in one call. */
export function classifyTitle(raw: string): TitleMatch & { normalized: string } {
  const normalized = normalizeTitle(raw);
  return { normalized, ...matchTitle(normalized) };
}
