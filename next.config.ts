import type { NextConfig } from "next";

import { BRAND_FILES } from "./lib/brand-assets";
import { parseServerEnv } from "./lib/env-schema";

// Fail `next build` / `next start` on a missing or invalid variable, so a bad
// environment fails the deploy, not the user (§ Configuration & Environment).
parseServerEnv(process.env);

// frontend-security-conventions.md § Default Headers. The CSP is per request,
// with a nonce, so it's set in middleware.ts.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The case URL holds the token: never send it to another origin in a Referer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera=() may hide the file picker's camera option (tech-design R4, checked in T34).
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Legacy twin of CSP frame-ancestors 'none'.
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Portable deploy artifact (§ Stack Baseline › Containerization).
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Case URLs are capabilities: keep every link page out of search engines (F06d).
      {
        source: "/v/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // Static SVG art: it renders nothing active even when opened directly
      // (Security 0002). The page CSP comes from middleware, which these
      // shared files skip.
      ...BRAND_FILES.filter((file) => file.endsWith(".svg")).map((source) => ({
        source,
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          },
        ],
      })),
      // The brand icons (public/): a day in the browser and on the CDN, as
      // the old 204 route was (review 0023).
      ...["/favicon.ico", ...BRAND_FILES].map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, s-maxage=86400",
          },
        ],
      })),
    ];
  },
};

export default nextConfig;
