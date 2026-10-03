// Liveness for the container HEALTHCHECK and the post-deploy smoke
// (frontend-devops-conventions.md § Dockerfile Baseline). It reveals nothing:
// no version, no env, no upstream status.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
