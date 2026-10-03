import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portable deploy artifact (§ Stack Baseline › Containerization).
  output: "standalone",
};

export default nextConfig;
