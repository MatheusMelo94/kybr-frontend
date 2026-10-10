// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/errors";
import {
  openSession,
  seedAlerts,
  seedScenario,
  setAlertFault,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.kybr.test" }),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { getMonitoring, listAlerts } from "@/lib/api/panel/alerts";

const API = "http://api.kybr.test";
const WIRE_CNPJ = /\b[0-9A-Z]{12}[0-9]{2}\b/;

let fetchSpy: ReturnType<typeof vi.spyOn>;
let email: string;

beforeEach(() => {
  email = `alertas-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedAlerts(email, "pm1");
  state.token = openSession(email).id;
  fetchSpy = vi.spyOn(globalThis, "fetch");
  reportMarker.mockClear();
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.restoreAllMocks();
});

function requests(): { url: string; headers: Headers; init: RequestInit }[] {
  return fetchSpy.mock.calls.map((args: unknown[]) => {
    const [input, init] = args as [URL | string, RequestInit];
    return { url: String(input), init, headers: new Headers(init.headers) };
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe("the panel client on every call (P06, ADR-0011)", () => {
  it.each([
    ["listAlerts", listAlerts, `${API}/v1/alerts?limit=50`],
    ["getMonitoring", getMonitoring, `${API}/v1/monitoring`],
  ] as const)("%s: no-store, the bearer, the BFF key", async (_, fn, url) => {
    await fn();
    const [first] = requests();
    expect(requests()).toHaveLength(1);
    expect(first?.url).toBe(url);
    expect(first?.init.cache).toBe("no-store");
    expect(first?.headers.get("authorization")).toBe(`Bearer ${state.token}`);
    expect(first?.headers.get("x-kybr-bff-key")).toBeTruthy();
    expect(first?.headers.get("x-kybr-poll")).toBeNull();
  });

  it.each([listAlerts, getMonitoring])(
    "no session → SESSAO_EXPIRADA, nothing sent",
    async (fn) => {
      state.token = undefined;
      expect(await codeOf(fn())).toBe("SESSAO_EXPIRADA");
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([listAlerts, getMonitoring])(
    "a 401 → SESSAO_EXPIRADA",
    async (fn) => {
      state.token = "sessao-inexistente";
      expect(await codeOf(fn())).toBe("SESSAO_EXPIRADA");
    },
  );
});

describe("listAlerts (D-M1, PM1)", () => {
  it("parses the list, newest first, with every CNPJ masked (A-F1)", async () => {
    const list = await listAlerts();
    expect(list).toHaveLength(7);
    for (const alert of list)
      expect(alert.seller.cnpj).toMatch(/^.{2}\..{3}\..{3}\/.{4}-\d{2}$/);
    expect(JSON.stringify(list)).not.toMatch(WIRE_CNPJ);
  });

  it("PM7: a 503 → UNAVAILABLE", async () => {
    seedScenario("alertas-falha", email);
    expect(await codeOf(listAlerts())).toBe("UNAVAILABLE");
  });

  it("a dropped connection → UNAVAILABLE", async () => {
    setAlertFault(email, "alerts", { kind: "drop", times: 1 });
    expect(await codeOf(listAlerts())).toBe("UNAVAILABLE");
  });

  it("F11 / A-F2: a schema failure → UNAVAILABLE and a paths-only ALERT_SCHEMA_INVALID", async () => {
    seedAlerts(email, "invalido-dados");
    expect(await codeOf(listAlerts())).toBe("UNAVAILABLE");
    expect(reportMarker).toHaveBeenCalledTimes(1);
    const [marker, context] = reportMarker.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(marker).toBe("ALERT_SCHEMA_INVALID");
    expect(context.operation).toBe("alerts-list");
    expect(context.paths).toMatch(/^0\./);
    expect(JSON.stringify(reportMarker.mock.calls)).not.toMatch(
      /Empresa|Exemplo|[0-9A-Z]{12}[0-9]{2}/,
    );
  });

  it("A-F2: a hostile responsavel never reaches the log", async () => {
    seedAlerts(email, "hostil");
    const list = await listAlerts();
    expect(list).toHaveLength(2);
    expect(reportMarker).not.toHaveBeenCalled();
  });
});

describe("getMonitoring (D-M2, PM2, PM7)", () => {
  it("parses C-M7-2", async () => {
    const status = await getMonitoring();
    expect(status.ativo).toBe(true);
    expect(status.monitorados).toBeGreaterThan(0);
    expect(status.proxima_varredura).toBeDefined();
  });

  it("a 503 → UNAVAILABLE", async () => {
    seedScenario("monitoramento-falha", email);
    expect(await codeOf(getMonitoring())).toBe("UNAVAILABLE");
  });
});
