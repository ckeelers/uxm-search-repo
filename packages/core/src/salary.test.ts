import { describe, it, expect } from "vitest";
import { parseCompensation } from "./salary";

const mid = (t: string) => parseCompensation(t).midpoint;

describe("parseCompensation", () => {
  it("returns UNKNOWN when nothing is stated", () => {
    expect(parseCompensation("Competitive salary and equity.").state).toBe(
      "UNKNOWN",
    );
    expect(parseCompensation("").state).toBe("UNKNOWN");
    expect(parseCompensation(null).state).toBe("UNKNOWN");
  });

  it("parses a plain range (Lyft, Discord shapes)", () => {
    const a = parseCompensation(
      "The salary range for this role is $176,000 - $220,000, plus equity.",
    );
    expect(a).toMatchObject({ state: "STATED", min: 176000, max: 220000, midpoint: 198000 });

    expect(mid("Base pay range: $272,000 to $306,000")).toBe(289000);
  });

  it("parses k-notation", () => {
    expect(parseCompensation("Salary range $150k–$180k")).toMatchObject({
      min: 150000,
      max: 180000,
      midpoint: 165000,
    });
  });

  it("converts hourly and monthly to annual", () => {
    expect(parseCompensation("Pay range: $80.00 - $100.00 per hour")).toMatchObject({
      min: 166400,
      max: 208000,
    });
    expect(parseCompensation("Compensation: $12,500 to $15,000 per month")).toMatchObject(
      { min: 150000, max: 180000 },
    );
  });

  it("takes the LOWEST band when a posting lists several (Gusto shape)", () => {
    const text =
      "Denver: The base salary range is $147,000 - $215,000. " +
      "San Francisco / New York: the base salary range is $178,000 - $253,000.";
    expect(parseCompensation(text)).toMatchObject({
      state: "STATED",
      min: 147000,
      max: 215000,
      midpoint: 181000,
    });
  });

  it("ignores non-salary dollar figures far from any cue", () => {
    expect(
      parseCompensation(
        "We process $5,000,000 in payments daily. Our 401k has a 4% match.",
      ).state,
    ).toBe("UNKNOWN");
  });

  it("treats non-USD postings as UNKNOWN", () => {
    expect(parseCompensation("Salaris: €90.000 - €120.000 per jaar").state).toBe(
      "UNKNOWN",
    );
    expect(parseCompensation("Base salary £110,000–£140,000").state).toBe("UNKNOWN");
  });

  it("discards implausible numbers", () => {
    expect(parseCompensation("Reference bonus of $500 for salary referrals").state).toBe(
      "UNKNOWN",
    );
  });

  it("the $150k threshold decision the pipeline will make", () => {
    // midpoint >= 150k -> kept
    expect(mid("Salary range $140,000 - $200,000")).toBe(170000);
    // midpoint < 150k -> pipeline will reject
    expect(mid("Salary range $120,000 - $150,000")).toBe(135000);
  });
});
