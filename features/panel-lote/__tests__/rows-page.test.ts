// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AC16, PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import { advanceBatch } from "@/tests/fixtures/msw/handlers/panel-batches";
import {
  newBatch,
  openSession,
  panelStore,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { rowsPage } from "@/features/panel-lote/data";

let id: string;
beforeEach(() => {
  state.token = openSession(PANEL_EMAILS.pago).id;
  const batch = newBatch(PANEL_EMAILS.pago, AC16.linhas);
  for (let i = 0; i < 4; i++) advanceBatch(batch);
  id = batch.id;
});

const rowReads = () =>
  panelStore().calls.filter((call) => call.path.includes("/rows"));

describe("rowsPage (T83; contract C2; Security C11)", () => {
  it("reads the first 25, unfiltered", async () => {
    const page = await rowsPage(id, {});
    expect(page.itens).toHaveLength(25);
    expect(page.total).toBe(184);
    expect(page.proximo_cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("filters by a valid status and follows the cursor", async () => {
    const first = await rowsPage(id, { status: "erro" });
    expect(first.total).toBe(3);
    const all = await rowsPage(id, {});
    const second = await rowsPage(id, { cursor: all.proximo_cursor ?? "" });
    expect(second.itens[0]?.cnpj).toBe(AC16.linhas[25]?.cnpj);
  });

  it.each([
    ["an unknown status", { status: "todos" }],
    ["an array status", { status: ["ok", "bad"] }],
    ["a malformed cursor", { cursor: "x&status=ok" }],
    ["a padded cursor", { cursor: "eyJvIjoyNX0=" }],
  ])(
    "%s → the first page, unfiltered, with no API call carrying it",
    async (_, params) => {
      const page = await rowsPage(id, params as never);
      expect(page.total).toBe(184);
      expect(rowReads().map((call) => call.path)).toEqual([
        `/v1/batches/${id}/rows?limit=25`,
      ]);
    },
  );

  it("a cursor the API refuses (422) → the first page, unfiltered", async () => {
    const page = await rowsPage(id, { cursor: "bm90LWEtY3Vyc29y" });
    expect(page.total).toBe(184);
    expect(rowReads()).toHaveLength(2);
  });
});
