// @vitest-environment node
import { describe, expect, it } from "vitest";

import { dynamic, GET } from "@/app/favicon.ico/route";

// AC 1: the link shows no favicon. Browsers still ask for /favicon.ico; an
// empty 204 answers them without a 404 console error (Lighthouse
// best-practices) and without adding a <link rel="icon"> to any page.
describe("GET /favicon.ico", () => {
  it("answers 204 with an empty body, so there is no icon and no 404", async () => {
    const response = GET();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("is cacheable by the browser and by the CDN, so a new visitor doesn't invoke a function (review 0023)", () => {
    expect(GET().headers.get("cache-control")).toBe(
      "public, max-age=86400, s-maxage=86400",
    );
  });

  it("renders on request: Next can't replay a prerendered 204 (it answers 500)", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
