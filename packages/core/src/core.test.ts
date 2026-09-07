import { describe, it, expect } from "vitest";
import { prisma, JobStatus, Track, SiteArrangement } from "./index";

describe("@searchexperience/core wiring", () => {
  it("exposes a Prisma client", () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.job.findMany).toBe("function");
  });

  it("re-exports domain enums", () => {
    expect(JobStatus.OPEN).toBe("OPEN");
    expect(Track.UX_DESIGN_MGR).toBe("UX_DESIGN_MGR");
    expect(SiteArrangement.HYBRID).toBe("HYBRID");
  });
});
