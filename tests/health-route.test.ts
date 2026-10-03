// @vitest-environment node
import { describe, expect, it } from "vitest";

import { dynamic, GET } from "@/app/api/health/route";

// frontend-devops-conventions.md § Dockerfile Baseline (HEALTHCHECK) and
// § CI Pipeline Shape (post-deploy smoke).
describe("GET /api/health", () => {
  it("answers 200 with a fixed body", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("is never cached, so a smoke check always reaches the deployment", () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
    expect(dynamic).toBe("force-dynamic");
  });
});
