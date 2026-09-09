import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  matchTitle,
  classifyTitle,
  contentCheck,
} from "./taxonomy";
import { Track } from "./types";

describe("normalizeTitle", () => {
  it("lowercases and trims", () => {
    expect(normalizeTitle("  UX Manager  ")).toBe("ux manager");
  });

  it("strips leading seniority / scope modifiers", () => {
    expect(normalizeTitle("Senior UX Manager")).toBe("ux manager");
    expect(normalizeTitle("Senior Staff Product Design Manager")).toBe(
      "product design manager",
    );
    expect(normalizeTitle("Group Design Manager")).toBe("design manager");
  });

  it("keeps 'lead' when it is the head noun, strips it when leading", () => {
    expect(normalizeTitle("Lead Product Designer")).toBe("product designer");
    expect(normalizeTitle("Design Lead")).toBe("design lead");
  });

  it("un-inverts 'Manager, X' comma forms", () => {
    expect(normalizeTitle("Manager, UX Design")).toBe("ux design manager");
    expect(normalizeTitle("Manager, User Experience")).toBe(
      "user experience manager",
    );
    expect(normalizeTitle("Research Manager, UX")).toBe("ux research manager");
  });

  it("treats a trailing comma clause as scope and drops it", () => {
    expect(normalizeTitle("Product Design Manager, Global Payments")).toBe(
      "product design manager",
    );
    expect(normalizeTitle("Product Design Manager II, Ad Formats")).toBe(
      "product design manager",
    );
  });

  it("removes parentheticals, level markers and slashes", () => {
    expect(normalizeTitle("UX Manager (Remote)")).toBe("ux manager");
    expect(normalizeTitle("Product Design Manager II")).toBe(
      "product design manager",
    );
    expect(normalizeTitle("UX/UI Manager")).toBe("ux ui manager");
  });
});

describe("matchTitle — the spec's headline cases", () => {
  const stage1 = (raw: string, track: Track) => {
    const r = classifyTitle(raw);
    expect(r.outcome, `${raw} -> ${JSON.stringify(r)}`).toBe("STAGE1_INCLUDE");
    expect(r.track).toBe(track);
  };
  const rejected = (raw: string) =>
    expect(classifyTitle(raw).outcome, raw).toBe("REJECTED");
  const review = (raw: string, reason: string) => {
    const r = classifyTitle(raw);
    expect(r.outcome, `${raw} -> ${JSON.stringify(r)}`).toBe("REVIEW_QUEUE");
    expect(r.reason).toBe(reason);
  };

  it("includes UX / Design Manager titles", () => {
    stage1("UX Manager", Track.UX_DESIGN_MGR);
    stage1("User Experience Manager", Track.UX_DESIGN_MGR);
    stage1("Product Design Manager", Track.UX_DESIGN_MGR);
    stage1("Manager, UX Design", Track.UX_DESIGN_MGR);
    stage1("UX/UI Manager", Track.UX_DESIGN_MGR);
    stage1("Senior Product Design Manager, Growth", Track.UX_DESIGN_MGR);
  });

  it("includes UX Research Manager titles on the research track", () => {
    stage1("UX Research Manager", Track.UX_RESEARCH_MGR);
    stage1("User Experience Research Manager", Track.UX_RESEARCH_MGR);
    stage1("Experience Research Manager", Track.UX_RESEARCH_MGR);
    stage1("Research Manager, UX", Track.UX_RESEARCH_MGR);
    stage1("Manager, UX Research", Track.UX_RESEARCH_MGR);
  });

  it("rejects Product / Program / Project / Engineering Manager", () => {
    rejected("Product Manager");
    rejected("Senior Product Manager, Search Experience");
    rejected("Group Product Manager, Compliance Agent Experience");
    rejected("Program Manager, Member Experience");
    rejected("Design Program Manager, Research Operations");
    rejected("Project Manager");
    rejected("Engineering Manager - Customer Experience AI");
  });

  it("keeps 'both words appear' traps out", () => {
    // 'product' and 'manager' both present, but not a Product Manager role
    expect(classifyTitle("Product Design Manager").outcome).toBe(
      "STAGE1_INCLUDE",
    );
    // ...and the actual PM role is rejected
    expect(classifyTitle("Product Manager, Design Systems").outcome).toBe(
      "REJECTED",
    );
  });

  it("routes borderline titles to review", () => {
    review("Design Manager", "bare-design-title");
    review("Group Design Manager", "bare-design-title");
    review("UX Product Manager", "ux-product-manager");
    review("Design Lead", "bare-design-title");
  });

  it("rejects the tier above manager (deferred to a later spec)", () => {
    rejected("Director, Product Design");
    rejected("Design Director");
    rejected("Head of Product Design");
    rejected("VP, Design");
  });

  it("rejects individual-contributor titles", () => {
    rejected("Staff Product Designer, Financial Services Lead");
    rejected("Lead Product Designer");
    rejected("Senior UX Researcher");
  });

  it("rejects other-function roles even when a design word rides along", () => {
    rejected("Manager, Software Engineering - Interaction Design");
    rejected("Engineering Manager, Design Systems");
    rejected("Data Science Manager, Experience Analytics");
  });

  it("rejects hardware / silicon design-manager titles", () => {
    rejected("Chip Design Manager");
    rejected("Manager, Digital Design - Mixed-Signal High-Speed I/O SerDes");
    rejected("Manager, Physical Design Circuit and Signoff CAD");
  });

  it("borderline titles carry a best-guess track for promotion", () => {
    expect(classifyTitle("Design Manager").track).toBe(Track.UX_DESIGN_MGR);
    expect(classifyTitle("Research Manager").track).toBe(Track.UX_RESEARCH_MGR);
  });

  it("handles more real-world title shapes", () => {
    expect(classifyTitle("Manager of Product Design").outcome).toBe("STAGE1_INCLUDE");
    expect(classifyTitle("Sr. Manager, User Experience Design").outcome).toBe(
      "STAGE1_INCLUDE",
    );
    expect(classifyTitle("UX Design Manager").outcome).toBe("STAGE1_INCLUDE");
    // content design is a UX discipline but not in the strong set yet -> review
    expect(classifyTitle("Content Design Manager").outcome).toBe("REVIEW_QUEUE");
    // DesignOps leads process/tooling, not a design team -> out of scope
    expect(classifyTitle("Design Operations Manager").outcome).toBe("REJECTED");
    expect(classifyTitle("Principal Product Designer").outcome).toBe("REJECTED");
  });
});

describe("contentCheck (Stage 2)", () => {
  it("auto-includes a description full of design-leadership signal", () => {
    const r = contentCheck(
      "You will manage a team of designers, run weekly design reviews, be " +
        "responsible for hiring designers, and support the career growth of your team. " +
        "5+ years leading a design team. Fluent in Figma and interaction design.",
    );
    expect(r.decision).toBe("auto-include");
    expect(r.corroborating).toBeGreaterThanOrEqual(3);
  });

  it("rejects a description that is really product management", () => {
    const r = contentCheck(
      "You will own the product roadmap, drive backlog prioritization, lead " +
        "sprint planning, define the product strategy and own revenue targets for the area.",
    );
    expect(r.decision).toBe("reject");
  });

  it("leaves an ambiguous description in review", () => {
    expect(contentCheck("Lead a cross-functional team to ship great products.").decision).toBe(
      "review",
    );
  });
});
