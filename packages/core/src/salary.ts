import { SalaryState } from "./types";

/**
 * Compensation parser (plan §4.2).
 *
 * Pulls a base-salary band out of free-text job copy, annualises it to USD, and
 * reduces a multi-zone posting to its **lowest** band. The pipeline then keeps
 * the role only if the band midpoint is >= $150k (or if nothing parsed —
 * "Salary unknown / unpublished").
 */

export interface Compensation {
  state: SalaryState;
  min?: number; // annualised USD, lowest band's lower bound
  max?: number; // lowest band's upper bound
  midpoint?: number; // round((min + max) / 2)
  raw?: string; // the text snippet the band came from
}

const UNKNOWN: Compensation = { state: SalaryState.UNKNOWN };

const MIN_PLAUSIBLE = 30_000;
const MAX_PLAUSIBLE = 1_000_000;

// a money token: "$150,000", "$150,000.00", "$150k", "$150K", "$150000", "$80.00"
const MONEY =
  /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s?[kK]\b|\d{2,7}(?:\.\d+)?)/g;

const RANGE_SEP = /\s*(?:-|–|—|to|through|–|—)\s*/;

function toNumber(tokenBody: string): number | null {
  const t = tokenBody.replace(/\s/g, "");
  if (/[kK]$/.test(t)) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

type Period = "year" | "hour" | "month";

function detectPeriod(text: string): Period {
  if (/\bper\s?hour\b|\bhourly\b|\/\s?hr\b|\/\s?hour\b|\ban hour\b/i.test(text))
    return "hour";
  if (/\bper\s?month\b|\bmonthly\b|\/\s?mo\b|\/\s?month\b|\ba month\b/i.test(text))
    return "month";
  return "year";
}

function annualise(n: number, period: Period): number {
  if (period === "hour") return Math.round(n * 40 * 52);
  if (period === "month") return Math.round(n * 12);
  return Math.round(n);
}

/** Is there a non-USD currency in play and no `$` at all? */
function looksNonUsd(text: string): boolean {
  if (text.includes("$")) return false;
  return /[£€₹¥]|\b(gbp|eur|cad|aud|inr|sek|chf|pln)\b/i.test(text);
}

export function parseCompensation(text: string | null | undefined): Compensation {
  if (!text) return UNKNOWN;
  if (looksNonUsd(text)) return UNKNOWN;

  // Narrow to a window around the first compensation cue, if there is one —
  // keeps us away from unrelated dollar figures elsewhere in the posting.
  const KEYWORD_CUE =
    /\b(salary|base pay|base compensation|pay range|compensation|annual (?:base )?salary|expected (?:base )?pay|target (?:base )?salary)\b/i;
  const RANGE_CUE =
    /\$\s?\d[\d,]*\.?\d*\s?k?\s*(?:-|–|—|to|through)\s*\$?\s?\d/i;

  let cue = text.search(KEYWORD_CUE);
  if (cue < 0) cue = text.search(RANGE_CUE);
  const scope =
    cue >= 0 ? text.slice(Math.max(0, cue - 200), cue + 400) : text;
  const period = detectPeriod(scope);

  // collect money tokens with their positions
  const tokens: Array<{ value: number; index: number; text: string }> = [];
  for (const m of scope.matchAll(MONEY)) {
    const value = toNumber(m[1]!);
    if (value != null) tokens.push({ value, index: m.index!, text: m[0] });
  }
  if (tokens.length === 0) return UNKNOWN;

  // build candidate bands
  const bands: Array<{ min: number; max: number; raw: string }> = [];

  // 1) explicit ranges: two tokens joined by a range separator
  const consumed = new Set<number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const between = scope.slice(a.index + a.text.length, b.index);
    if (RANGE_SEP.test(between) && between.replace(RANGE_SEP, "").trim() === "") {
      bands.push(makeBand(a.value, b.value, period, `${a.text}${between}${b.text}`));
      consumed.add(i);
      consumed.add(i + 1);
      i++;
    }
  }

  // 2) no explicit ranges but an even run of bare figures -> pair them in order
  if (bands.length === 0 && tokens.length >= 2 && tokens.length % 2 === 0) {
    for (let i = 0; i < tokens.length; i += 2) {
      bands.push(
        makeBand(
          tokens[i]!.value,
          tokens[i + 1]!.value,
          period,
          `${tokens[i]!.text} ${tokens[i + 1]!.text}`,
        ),
      );
    }
  }

  // 3) still nothing, but a single figure sits right on a comp cue -> point band
  if (bands.length === 0 && cue >= 0 && tokens[0]) {
    bands.push(makeBand(tokens[0].value, tokens[0].value, period, tokens[0].text));
  }

  const valid = bands.filter(
    (b) =>
      b.min >= MIN_PLAUSIBLE &&
      b.min <= MAX_PLAUSIBLE &&
      b.max >= b.min &&
      b.max <= MAX_PLAUSIBLE,
  );
  if (valid.length === 0) return UNKNOWN;

  // lowest band wins (spec: location-adjusted -> lowest zone)
  valid.sort((a, b) => a.min - b.min);
  const band = valid[0]!;
  return {
    state: SalaryState.STATED,
    min: band.min,
    max: band.max,
    midpoint: Math.round((band.min + band.max) / 2),
    raw: band.raw.trim(),
  };
}

function makeBand(a: number, b: number, period: Period, raw: string) {
  const lo = annualise(Math.min(a, b), period);
  const hi = annualise(Math.max(a, b), period);
  return { min: lo, max: hi, raw };
}
