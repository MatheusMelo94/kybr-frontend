// The static brand files in public/brand/ (brand v1, B1–B3): the only
// /brand/ paths both hosts serve as they are (ADR-0008 rule 5) and cache.
// Any other /brand/ path gets the host's normal routing, CSP and 404
// (Security 0001). Shared by middleware.ts and next.config.ts.
export const BRAND_FILES = [
  "/brand/kybr-icon.svg",
  "/brand/apple-touch-icon.png",
  "/brand/kybr-og-1200x630.png",
] as const;
