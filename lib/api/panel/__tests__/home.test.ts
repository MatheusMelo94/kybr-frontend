// @vitest-environment node
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/errors";
import { HOME_NAMES } from "@/tests/fixtures/factories/panel";
import {
  openSession,
  panelStore,
  seedDashboard,
  setHomeFault,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

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

import { getDashboard, hideFirstSteps } from "@/lib/api/panel/home";
import { saveOwnName, saveWorkspace } from "@/lib/api/panel/workspace";

// T130: the M8a data functions (D-H1, D-H2, D-W3 name, D-W4), Pre-Contract.

const API = "http://api.kybr.test";
const WIRE_CNPJ = /\b[0-9A-Z]{12}[0-9]{2}\b/;
const CPF_DIGITS = /123\.456\.789-09|12345678909/;

let email: string;

beforeEach(() => {
  email = `home-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedDashboard(email, "populado");
  state.token = openSession(email).id;
  reportMarker.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe("getDashboard (D-H1, C-M8-1)", () => {
  it("reads the dashboard with the session, no-store", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dashboard = await getDashboard();
    expect(dashboard.kpis?.verificados).toBe(1240);
    const [input, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(String(input)).toBe(`${API}/v1/dashboard`);
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${state.token}`,
    );
  });

  it("O-F4: masks every CNPJ and every CPF in a name in the data layer", async () => {
    const dashboard = await getDashboard();
    const text = JSON.stringify(dashboard);
    expect(text).not.toMatch(WIRE_CNPJ);
    expect(text).not.toMatch(CPF_DIGITS);
    const names = [
      ...(dashboard.fila ?? []).map((item) => item.razao_social),
      ...(dashboard.alertas ?? []).map((alert) => alert.seller.razao_social),
    ];
    expect(names).toContain("Fulano ***.***.***-** ME");
    expect(names).toContain("Beltrano ***.***.***-**");
    // A hostile name stays text (rendered as React text, never HTML).
    expect(names).toContain(HOME_NAMES.hostile);
    for (const item of dashboard.fila ?? [])
      expect(item.cnpj).toMatch(
        /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/,
      );
  });

  it("keeps a missing card missing (PH3)", async () => {
    setHomeFault(email, "dashboard", { kind: "omit", sem: ["fila", "semana"] });
    const dashboard = await getDashboard();
    expect(dashboard.fila).toBeUndefined();
    expect(dashboard.semana).toBeUndefined();
    expect(dashboard.kpis).toBeDefined();
  });

  it("a 503 throws UNAVAILABLE (the page's error.tsx: PH4)", async () => {
    setHomeFault(email, "dashboard", { kind: "503" });
    expect(await codeOf(getDashboard())).toBe("UNAVAILABLE");
  });

  it("a 401 throws SESSAO_EXPIRADA; no session sends nothing", async () => {
    panelStore().sessions.clear();
    expect(await codeOf(getDashboard())).toBe("SESSAO_EXPIRADA");
    state.token = undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await codeOf(getDashboard())).toBe("SESSAO_EXPIRADA");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a bad body throws UNAVAILABLE and reports the paths only, never values", async () => {
    server.use(
      http.get(`${API}/v1/dashboard`, () =>
        HttpResponse.json({ kpis: { verificados: -1 }, segredo: "VALOR-X" }),
      ),
    );
    expect(await codeOf(getDashboard())).toBe("UNAVAILABLE");
    expect(reportMarker).toHaveBeenCalledWith(
      "DASHBOARD_SCHEMA_INVALID",
      expect.objectContaining({ operation: "dashboard" }),
    );
    expect(JSON.stringify(reportMarker.mock.calls)).not.toContain("VALOR-X");
  });
});

describe("hideFirstSteps (D-H2)", () => {
  it("PUTs { oculto: true } and succeeds on the 204", async () => {
    const result = await hideFirstSteps();
    expect(result.ok).toBe(true);
    expect(panelStore().calls.at(-1)).toMatchObject({
      method: "PUT",
      path: "/v1/dashboard/primeiros-passos",
      bodyKeys: ["oculto"],
    });
    expect(panelStore().dashboards.get(email)?.primeiros_passos.oculto).toBe(
      true,
    );
  });
});

describe("saveWorkspace / saveOwnName (D-W3, D-W4)", () => {
  it("saveWorkspace PUTs the platform name and contact", async () => {
    const result = await saveWorkspace({
      nome: "Plataforma Nova",
      contato_vendedor: { tipo: "email", valor: "ajuda@exemplo.test" },
    });
    expect(result.ok).toBe(true);
    expect(panelStore().accounts.get(email)?.workspace.nome).toBe(
      "Plataforma Nova",
    );
  });

  it("saveOwnName PUTs /v1/me { nome }", async () => {
    const result = await saveOwnName({ nome: "Nome Novo" });
    expect(result.ok).toBe(true);
    expect(panelStore().calls.at(-1)).toMatchObject({
      method: "PUT",
      path: "/v1/me",
      bodyKeys: ["nome"],
    });
    expect(panelStore().accounts.get(email)?.nome).toBe("Nome Novo");
  });

  it("a failure comes back as a result, not a throw", async () => {
    setHomeFault(email, "me-put", { kind: "503" });
    const result = await saveOwnName({ nome: "X" });
    expect(result.ok).toBe(false);
  });
});
