// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CATEGORIES, PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import { openSession, seedScenario } from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { getCategories } from "@/lib/api/panel/workspace";

beforeEach(() => {
  state.token = openSession(PANEL_EMAILS.nova).id;
});

describe("getCategories (D-W2)", () => {
  it("returns the backend's list, no-store", async () => {
    expect(await getCategories()).toEqual(CATEGORIES);
  });

  it("throws on a failure, for the route's error boundary", async () => {
    seedScenario("categorias-falham");
    await expect(getCategories()).rejects.toThrow();
  });
});
