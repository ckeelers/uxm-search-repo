// Re-export the generated Prisma model types and enums so the rest of the
// codebase imports domain types from "@searchexperience/core", not from a
// deep generated path.

export type {
  Company,
  Job,
  SavedJob,
  CrawlRun,
} from "./generated/prisma";

export {
  Platform,
  Track,
  MatchOutcome,
  SiteArrangement,
  RemoteScope,
  SalaryState,
  JobStatus,
  SavedStatus,
} from "./generated/prisma";
