// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { apiRequest } from "@/lib/api/client";
import { server as msw } from "@/tests/fixtures/msw/server";

// Security M3-07: finding 0003's REDIRECT_REFUSED marker reads undici's error
// text. client.test.ts runs through MSW's fetch interceptor, which only
// emulates that error, so here the real fetch talks to a real local server
// that answers 302. A Node or undici upgrade that rewords the error fails CI.
const env = vi.hoisted(() => ({
  API_BASE_URL: "",
  API_BFF_KEY: "test-only-bff-key-0123456789abcdef",
}));
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

let api: Server;
let followed = false;

beforeAll(async () => {
  // MSW patches fetch for the whole suite: restore the real one for this file.
  msw.close();
  api = createServer((request, response) => {
    if (request.url === "/followed") followed = true;
    response.writeHead(302, { location: "/followed" }).end();
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  env.API_BASE_URL = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => api.close(resolve));
  msw.listen({ onUnhandledRequest: "error" });
});

describe("apiRequest against a real server that redirects", () => {
  it("refuses the 302, reports REDIRECT_REFUSED and returns NETWORK", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await apiRequest({
      operation: "probe",
      path: "/public/probe",
      schema: z.unknown(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK" } });
    expect(followed).toBe(false);
    expect(reportMarker).toHaveBeenCalledWith("REDIRECT_REFUSED", {
      operation: "probe",
    });
  });
});
