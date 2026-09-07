import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // core is published as raw TypeScript; let Next compile it.
  transpilePackages: ["@searchexperience/core"],
  // this app lives in a monorepo — point tracing at the repo root.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
};

export default nextConfig;
