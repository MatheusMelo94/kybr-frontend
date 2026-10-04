// AC 1: no favicon on the link. Browsers request /favicon.ico anyway; an empty
// 204 answers without a 404 console error (Lighthouse best-practices) and
// without a <link rel="icon"> on any page. middleware.ts skips this path.
// Rendered on request: Next can't replay a prerendered 204 (it answers 500).
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "public, max-age=86400" },
  });
}
