import type { NextConfig } from "next";

import { parseServerEnv } from "./lib/env-schema";

// Fail `next build` / `next start` on a missing or invalid variable, so a bad
// environment fails the deploy, not the user (§ Configuration & Environment).
parseServerEnv(process.env);

const nextConfig: NextConfig = {
  // Portable deploy artifact (§ Stack Baseline › Containerization).
  output: "standalone",
};

export default nextConfig;
