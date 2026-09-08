import { describe, it, expect } from "vitest";
import { classifyLocation } from "./location";

const loc = (raw: string, desc = "") => classifyLocation(raw, desc);

describe("classifyLocation — real Greenhouse location strings", () => {
  it("plain 'City, ST'", () => {
    expect(loc("New York, NY")).toMatchObject({
      isUsBased: true,
      siteStates: ["NY"],
      siteArrangement: "ONSITE",
      remoteUs: false,
    });
  });

  it("full state name + region suffix", () => {
    expect(loc("Oakland, California, United States, AMER")).toMatchObject({
      isUsBased: true,
      siteStates: ["CA"],
    });
  });

  it("metro name with no state token", () => {
    expect(loc("San Francisco Bay Area")).toMatchObject({ siteStates: ["CA"] });
  });

  it("semicolon multi-location with embedded 'Hybrid' (Gusto)", () => {
    const r = loc(
      "Denver, CO - Hybrid; New York, New York, United States; San Francisco, CA - Hybrid",
    );
    expect(r.siteStates.sort()).toEqual(["CA", "CO", "NY"]);
    expect(r.siteArrangement).toBe("HYBRID");
    expect(r.remoteUs).toBe(false);
    expect(r.isUsBased).toBe(true);
  });

  it("bullet separator (Figma)", () => {
    const r = loc("San Francisco, CA • New York, NY • United States");
    expect(r.siteStates.sort()).toEqual(["CA", "NY"]);
  });

  it("sited AND remote at once (Pinterest)", () => {
    const r = loc("San Francisco, CA, US; Remote, US");
    expect(r.siteStates).toEqual(["CA"]);
    expect(r.remoteUs).toBe(true);
    expect(r.remoteScope).toBe("ANYWHERE_US");
  });

  it("plain remote", () => {
    expect(loc("Remote - US")).toMatchObject({
      isUsBased: true,
      remoteUs: true,
      siteStates: [],
      remoteScope: "ANYWHERE_US",
    });
  });

  it("non-US postings are flagged", () => {
    expect(loc("United Kingdom").isUsBased).toBe(false);
    expect(loc("Canada").isUsBased).toBe(false);
    expect(loc("London, UK").isUsBased).toBe(false);
  });

  it("mixed US + non-US keeps the US state and stays US-based", () => {
    const r = loc("Toronto, ON; New York, NY");
    expect(r.siteStates).toEqual(["NY"]);
    expect(r.isUsBased).toBe(true);
  });

  it("picks up a US-remote option stated only in the description (Figma shape)", () => {
    const r = loc(
      "San Francisco, CA • New York, NY • United States",
      "This is a full-time role that can be held from one of our US hubs or remotely in the United States.",
    );
    expect(r.siteStates.sort()).toEqual(["CA", "NY"]);
    expect(r.remoteUs).toBe(true);
    expect(r.remoteScope).toBe("ANYWHERE_US");
    expect(r.isUsBased).toBe(true);
  });

  it("reads a remote state-list out of the description", () => {
    const r = loc(
      "Remote, US",
      "This is a remote role. Candidates must reside in California, New York, or Washington.",
    );
    expect(r.remoteScope).toBe("STATE_LIST");
    expect(r.remoteStates.sort()).toEqual(["CA", "NY", "WA"]);
  });

  it("resolves bare city names to a state", () => {
    expect(loc("San Francisco; Remote; Hybrid")).toMatchObject({
      siteStates: ["CA"],
      siteArrangement: "HYBRID",
      remoteUs: true,
    });
    expect(loc("Seattle").siteStates).toEqual(["WA"]);
    expect(loc("Austin, Texas").siteStates).toEqual(["TX"]);
  });

  it("Washington, DC resolves to DC, not Washington state", () => {
    expect(loc("Washington, DC").siteStates).toEqual(["DC"]);
  });

  it("empty location -> least-restrictive default", () => {
    expect(classifyLocation("", "")).toMatchObject({
      isUsBased: true,
      siteStates: [],
      siteArrangement: "UNKNOWN",
      remoteUs: false,
    });
  });
});
