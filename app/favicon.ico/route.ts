// AC 1: no favicon on the link (nor, for now, the panel). Browsers request
// /favicon.ico anyway; an empty 204 answers without a 404 console error
// (Lighthouse best-practices) and without a <link rel="icon"> on any page.
// middleware.ts passes this path through on both hosts (P4-001).
// Rendered on request: Next can't replay a prerendered 204 (it answers 500).
// s-maxage lets Vercel's CDN answer it, so the function runs about once a day
// per region rather than once per new visitor (review 0023).
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "public, max-age=86400, s-maxage=86400" },
  });
}
