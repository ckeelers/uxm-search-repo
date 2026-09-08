import { SalaryState } from "./types";

/**
 * Compensation parser (plan §4.2).
 *
 * Scans the whole posting for a $-range, prefers ranges that sit next to a
 * salary keyword, annualises to USD, and reduces a multi-zone posting to its
 * **lowest** band. The pipeline keeps a role only if the band midpoint is
 * >= $150k (or nothing parsed -> "Salary unknown / unpublished").
 */

export interface Compensation {
  state: SalaryState;
  min?: number;
  max?: number;
  midpoint?: number;
  raw?: string;
}

const UNKNOWN: Compensation = { state: SalaryState.UNKNOWN };

const MIN_PLAUSIBLE = 30_000;
const MAX_PLAUSIBLE = 1_000_000;

// a money token: "$150,000", "$150,000.00", "$150k", "$150K", "$150000", "$80.00"
const MONEY =
  /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s?[kK]\b|\d{2,7}(?:\.\d+)?)/g;

// the ENTIRE gap between two money tokens is just a range separator
const RANGE_SEP_ONLY = /^\s*(?:-|–|—|to|through)\s*$/i;

const SALARY_KW =
  /\b(salary|base pay|base compensation|compensation|pay range|pay band|annual (?:base )?pay|expected (?:base )?pay|target (?:base )?salary|total cash|on-target earnings|ote)\b/i;

type Period = "year" | "hour" | "month";

function toNumber(body: string): number | null {
  const t = body.replace(/\s/g, "");
  if (/[kK]$/.test(t)) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function detectPeriod(ctx: string): Period {
  if (/\bper\s?hour\b|\bhourly\b|\/\s?hr\b|\/\s?hour\b|\ban hour\b/i.test(ctx)) return "hour";
  if (/\bper\s?month\b|\bmonthly\b|\/\s?mo\b|\/\s?month\b|\ba month\b/i.test(ctx)) return "month";
  return "year";
}

function annualise(n: number, period: Period): number {
  if (period === "hour") return Math.round(n * 40 * 52);
  if (period === "month") return Math.round(n * 12);
  return Math.round(n);
}

function looksNonUsd(text: string): boolean {
  if (text.includes("$")) return false;
  return /[£€₹¥]|\b(gbp|eur|cad|aud|inr|sek|chf|pln)\b/i.test(text);
}

interface Band {
  min: number;
  max: number;
  raw: string;
  near: boolean;
}

function makeBand(a: number, b: number, period: Period, raw: string, near: boolean): Band {
  return {
    min: annualise(Math.min(a, b), period),
    max: annualise(Math.max(a, b), period),
    raw: raw.trim(),
    near,
  };
}

function plausible(b: Band): boolean {
  return (
    b.min >= MIN_PLAUSIBLE &&
    b.min <= MAX_PLAUSIBLE &&
    b.max >= b.min &&
    b.max <= MAX_PLAUSIBLE
  );
}

function result(b: Band): Compensation {
  return {
    state: SalaryState.STATED,
    min: b.min,
    max: b.max,
    midpoint: Math.round((b.min + b.max) / 2),
    raw: b.raw,
  };
}

export function parseCompensation(text: string | null | undefined): Compensation {
  if (!text) return UNKNOWN;
  if (looksNonUsd(text)) return UNKNOWN;

  const tokens = [...text.matchAll(MONEY)]
    .map((m) => ({ value: toNumber(m[1]!), index: m.index!, text: m[0] }))
    .filter((t): t is { value: number; index: number; text: string } => t.value != null);
  if (tokens.length === 0) return UNKNOWN;

  // pair adjacent tokens into ranges
  const bands: Band[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const gapStart = a.index + a.text.length;
    const between = text.slice(gapStart, b.index);
    const adjacent =
      b.index - gapStart <= 15 && (RANGE_SEP_ONLY.test(between) || between.trim() === "");
    if (!adjacent) continue;

    const ctx = text.slice(Math.max(0, a.index - 60), b.index + b.text.length + 60);
    const pre = text.slice(Math.max(0, a.index - 140), a.index);
    bands.push(
      makeBand(
        a.value,
        b.value,
        detectPeriod(ctx),
        `${a.text}${between}${b.text}`,
        SALARY_KW.test(pre) || SALARY_KW.test(ctx),
      ),
    );
    i++;
  }

  let valid = bands.filter(plausible);
  const near = valid.filter((b) => b.near);
  if (near.length) valid = near;

  if (valid.length > 0) {
    valid.sort((a, b) => a.min - b.min);
    return result(valid[0]!);
  }

  // no range — a single figure sitting right on a salary label
  const single = text.match(
    /\b(?:salary|base pay|base compensation|compensation|pay)\b[^.$\n]{0,40}(\$\s?\d[\d,]*(?:\.\d+)?\s?[kK]?)/i,
  );
  if (single?.[1]) {
    const v = toNumber(single[1].replace("$", ""));
    if (v != null) {
      const at = single.index ?? 0;
      const b = makeBand(v, v, detectPeriod(text.slice(at, at + 80)), single[1], true);
      if (plausible(b)) return result(b);
    }
  }

  return UNKNOWN;
}
