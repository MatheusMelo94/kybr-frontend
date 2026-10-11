// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import {
  openSession,
  panelStore,
  seedScenario,
  seedSellers,
  setSellerFault,
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

import {
  auditCsvResponse,
  sellersCsvResponse,
} from "@/features/panel-sellers/export-route";

// T142 (AC 57, O-F5, P08, Q5): the two export handlers. host → zod →
// requireSession() → the capped stream → re-escaped → an attachment.

const EMAIL = PANEL_EMAILS.pago;
const BASE = "http://app.kybr.test";
const sellers = (query = "") =>
  sellersCsvResponse(new URL(`${BASE}/vendedores/exportar.csv${query}`));
const audit = (query = "") =>
  auditCsvResponse(new URL(`${BASE}/vendedores/auditoria.csv${query}`));
const apiCalls = (path: string) =>
  panelStore().calls.filter((call) => call.path.startsWith(path));

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(EMAIL).id;
  vi.clearAllMocks();
  seedSellers(EMAIL, "ps1");
  // 2026-10-05 23:30 in São Paulo is already the 6th in UTC.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-06T02:30:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
  unseedScenario("csv-sem-escape");
  unseedScenario("csv-cpf-cru");
  setSellerFault(EMAIL, "sellers-csv", undefined);
  setSellerFault(EMAIL, "audit-csv", undefined);
});

describe("sellersCsvResponse (D-S4)", () => {
  it("200: an attachment named by the São Paulo date, private, nosniff", async () => {
    const response = await sellers();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="kybr-vendedores-2026-10-05.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toContain('"CNPJ";"Razão social"');
  });

  it("passes the current q and status on", async () => {
    await sellers("?q=exemplo&status=bloqueado");
    const [call] = apiCalls("/v1/sellers/export").slice(-1);
    expect(call?.path).toContain("status=bloqueado");
    expect(call?.path).toContain("q=exemplo");
  });

  it("PS6, the backend didn't escape: every cell gets the ' prefix, headers too", async () => {
    seedScenario("csv-sem-escape", EMAIL);
    const text = await (await sellers()).text();
    expect(text).toContain('"\'=HYPERLINK(""http://exemplo.test"")"');
    expect(text).not.toMatch(/;"=HYPERLINK/);
    expect(text).toContain('"CNPJ";"Razão social"');
  });

  it.each([
    ["?q=" + "a".repeat(101)],
    ["?status=qualquer"],
    ["?extra=1"],
    ["?q=a&q=b"],
  ])("a refused query %s → 400 with no API call", async (query) => {
    const before = apiCalls("/v1/sellers/export").length;
    const response = await sellers(query);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
    expect(apiCalls("/v1/sellers/export").length).toBe(before);
  });

  it.each([
    ["sellers", sellers],
    ["audit", audit],
  ] as const)(
    "M8C-01: the %s CSV masks a CPF the backend left in the name columns",
    async (_name, get) => {
      seedScenario("csv-cpf-cru", EMAIL);
      const response = await get();
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("***.***.***-**");
      expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}|\D\d{11}\D/);
    },
  );

  it("the cap: exactly 4 MiB passes", async () => {
    setSellerFault(EMAIL, "sellers-csv", { kind: "csv-exato", times: 1 });
    expect((await sellers()).status).toBe(200);
  });

  it.each([["csv-grande"], ["csv-html"], ["500"], ["drop"]] as const)(
    "a backend %s → 502 with no body",
    async (kind) => {
      setSellerFault(EMAIL, "sellers-csv", { kind, times: 1 });
      const response = await sellers();
      expect(response.status).toBe(502);
      expect(await response.text()).toBe("");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it("no session → the requireSession() redirect to /entrar", async () => {
    state.token = undefined;
    await expect(sellers()).rejects.toThrow(/NEXT_REDIRECT \/entrar/);
  });

  it("off the panel host → 404 with no API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    const before = panelStore().calls.length;
    await expect(sellers()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls.length).toBe(before);
  });
});

describe("auditCsvResponse (D-S5)", () => {
  it("200 over the last 3 months by default; no IP or session-hash column (Q5)", async () => {
    const response = await audit();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="kybr-auditoria-2026-10-05.csv"',
    );
    const [call] = apiCalls("/v1/reports/audit.csv").slice(-1);
    expect(call?.path).toContain("de=2026-07-05");
    expect(call?.path).toContain("ate=2026-10-05");
    const header = (await response.text()).split("\r\n")[0] ?? "";
    expect(header).not.toMatch(/IP|sess/i);
  });

  it("sends the chosen period", async () => {
    await audit("?de=2026-01-01&ate=2026-06-30");
    const [call] = apiCalls("/v1/reports/audit.csv").slice(-1);
    expect(call?.path).toContain("de=2026-01-01");
    expect(call?.path).toContain("ate=2026-06-30");
  });

  it.each([
    ["?de=2025-01-01&ate=2026-06-30"],
    ["?de=2026-06-30&ate=2026-01-01"],
    ["?de=2026-02-30&ate=2026-03-01"],
    ["?de=2026-01-01"],
  ])("a refused period %s → 400 with no API call", async (query) => {
    const before = apiCalls("/v1/reports/audit.csv").length;
    expect((await audit(query)).status).toBe(400);
    expect(apiCalls("/v1/reports/audit.csv").length).toBe(before);
  });

  it("over the cap → 502 with no body", async () => {
    setSellerFault(EMAIL, "audit-csv", { kind: "csv-grande", times: 1 });
    const response = await audit();
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
  });
});
