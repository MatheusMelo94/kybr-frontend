// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AC16,
  FOREIGN_BATCH_ID,
  PANEL_EMAILS,
} from "@/tests/fixtures/factories/panel";
import { advanceBatch } from "@/tests/fixtures/msw/handlers/panel-batches";
import {
  newBatch,
  openSession,
  panelStore,
  seedScenario,
  setFault,
  unseedScenario,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
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

import { batchCsvResponse } from "@/features/panel-lote/download-route";

const BOM = "﻿";
let id: string;

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.pago).id;
  vi.clearAllMocks();
  const batch = newBatch(PANEL_EMAILS.pago, AC16.linhas);
  for (let i = 0; i < 4; i++) advanceBatch(batch);
  id = batch.id;
  // 2026-10-05 23:30 in São Paulo is already the 6th in UTC.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T02:30:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
  unseedScenario("csv-sem-escape");
});

describe("batchCsvResponse (D-B4, P08, C9)", () => {
  it("200: the backend's escaped CSV byte for byte, as an attachment named by the São Paulo date, private, nosniff", async () => {
    const response = await batchCsvResponse(id, "result");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="kybr-lote-2026-10-05-resultado.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await response.arrayBuffer(),
    );
    expect(text.startsWith(`${BOM}"CNPJ";"Razão social"`)).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("the errors file has its own name", async () => {
    const response = await batchCsvResponse(id, "errors");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="kybr-lote-2026-10-05-erros.csv"',
    );
  });

  it("PB8 (the backend didn't escape): the file still has the ' prefix", async () => {
    seedScenario("csv-sem-escape", PANEL_EMAILS.pago);
    const batch = panelStore().batches.get(id);
    if (batch === undefined) throw new Error("no batch");
    const hostile = batch.linhas.find((linha) => linha.responsavel);
    if (hostile === undefined) throw new Error("no responsavel");
    hostile.responsavel = '=HYPERLINK("http://x")';
    const text = await (await batchCsvResponse(id, "result")).text();
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).not.toMatch(/;"=HYPERLINK/);
  });

  it.each([
    ["csv-grande"],
    ["csv-html"],
    ["csv-aspas"],
    ["csv-virgula"],
    ["csv-irregular"],
    ["500"],
  ] as const)("a backend %s → 502 with no body", async (kind) => {
    setFault(PANEL_EMAILS.pago, "result.csv", { kind, times: 1 });
    const response = await batchCsvResponse(id, "result");
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("an unknown or foreign id → 404; a malformed id → 404 with no API call", async () => {
    await expect(
      batchCsvResponse("3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", "result"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    // The fixture's other account's batch, read from renata's session.
    state.token = openSession(PANEL_EMAILS.renata).id;
    await expect(batchCsvResponse(FOREIGN_BATCH_ID, "result")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    const before = panelStore().calls.length;
    await expect(batchCsvResponse("../x", "result")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(panelStore().calls.length).toBe(before);
  });

  it("no session → the requireSession() redirect to /entrar", async () => {
    state.token = undefined;
    await expect(batchCsvResponse(id, "result")).rejects.toThrow(
      /NEXT_REDIRECT \/entrar\?motivo=sessao/,
    );
  });

  it("off the panel host → 404 before anything else", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    const before = panelStore().calls.length;
    await expect(batchCsvResponse(id, "result")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(panelStore().calls.length).toBe(before);
  });
});
