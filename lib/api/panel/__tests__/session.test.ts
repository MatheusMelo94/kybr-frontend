// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { meSchema } from "@/lib/api/schemas/panel/me";
import { server } from "@/tests/fixtures/msw/server";

const API = "http://api.kybr.test";
const TOKEN = "sessao-sintetica-0123456789";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
  order: [] as string[],
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));
vi.mock("@/lib/api/panel/host", () => ({
  assertPanelHost: vi.fn(async () => {
    state.order.push("host");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: vi.fn(async () => {
    state.order.push("cookie");
    return state.token;
  }),
}));
// React's cache() memoizes per request on the server; here, per test.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      let memo: { value: R } | undefined;
      return (...args: A): R => (memo ??= { value: fn(...args) }).value;
    },
  };
});

const ME = {
  nome: "Renata Exemplo",
  email: "renata@exemplo.test",
  workspace: {
    nome: "Loja Exemplo",
    slug: "loja-exemplo",
    link_url: "https://kybr.com.br/v/loja-exemplo",
    contato_vendedor: { tipo: "email", valor: "suporte@exemplo.test" },
    categoria: "c1",
    onboarding_concluido: true,
    webhook_configurado: false,
    plano: { tipo: "teste", usadas: 1, limite: 200 },
    contagens: {
      fila_abertos: 3,
      fila_vencidos: 1,
      alertas_criticos_abertos: 0,
      vendedores: 10,
      lote_em_andamento: false,
    },
  },
};

function meReplies(status = 200): { calls: number } {
  const seen = { calls: 0 };
  server.use(
    http.get(`${API}/v1/me`, ({ request }) => {
      seen.calls += 1;
      state.order.push("api");
      expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      return status === 200
        ? HttpResponse.json(ME)
        : HttpResponse.json(
            { code: "SESSAO_EXPIRADA", message: "x" },
            { status },
          );
    }),
  );
  return seen;
}

async function freshSession(): Promise<
  typeof import("@/lib/api/panel/session")
> {
  vi.resetModules();
  return import("@/lib/api/panel/session");
}

// Each test re-imports the module (vi.resetModules). Under a loaded full run
// the first, cold import (the whole module graph's transform) alone can pass
// the 5 s test timeout, and its late getSession() then lands in the next
// test. Warm the transform once, with room, before any test starts.
beforeAll(async () => {
  await import("@/lib/api/panel/session");
}, 30_000);

beforeEach(() => {
  state.headers = new Headers({ "x-kybr-panel-path": "/fila?aba=x" });
  state.token = TOKEN;
  state.order = [];
  redirect.mockClear();
});

describe("getSession (ADR-0009 rule 5)", () => {
  it("makes no API call without a cookie", async () => {
    state.token = undefined;
    const seen = meReplies();
    const { getSession } = await freshSession();

    expect(await getSession()).toBeNull();
    expect(seen.calls).toBe(0);
  });

  it("checks the host first, then makes one GET /v1/me per request", async () => {
    const seen = meReplies();
    const { getSession } = await freshSession();

    const [first, second] = await Promise.all([getSession(), getSession()]);
    expect(first?.workspace.nome).toBe("Loja Exemplo");
    expect(second).toBe(first);
    expect(seen.calls).toBe(1);
    expect(state.order[0]).toBe("host");
  });

  it("returns null on a 401", async () => {
    meReplies(401);
    const { getSession } = await freshSession();

    expect(await getSession()).toBeNull();
  });
});

describe("requireSession", () => {
  it("returns the session when there is one", async () => {
    meReplies();
    const { requireSession } = await freshSession();

    expect((await requireSession()).email).toBe("renata@exemplo.test");
  });

  it("redirects to /entrar?motivo=sessao&volta=<x-kybr-panel-path> without one", async () => {
    meReplies(401);
    const { requireSession } = await freshSession();

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      "/entrar?motivo=sessao&volta=%2Ffila%3Faba%3Dx",
    );
  });

  it("drops a volta that isn't a safe panel path", async () => {
    state.token = undefined;
    state.headers = new Headers({ "x-kybr-panel-path": "//evil.example" });
    const { requireSession } = await freshSession();

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/entrar?motivo=sessao");
  });
});

describe("meSchema (D-W1, AC 11)", () => {
  it("treats contagens and plano as optional", () => {
    const { plano, contagens, ...workspace } = ME.workspace;
    void plano;
    void contagens;

    expect(
      meSchema.parse({ ...ME, workspace }).workspace.plano,
    ).toBeUndefined();
  });

  it("hides a malformed plano or contagens instead of failing the page", () => {
    const parsed = meSchema.parse({
      ...ME,
      workspace: { ...ME.workspace, plano: { tipo: "outro" }, contagens: "x" },
    });

    expect(parsed.workspace.plano).toBeUndefined();
    expect(parsed.workspace.contagens).toBeUndefined();
    expect(parsed.workspace.nome).toBe("Loja Exemplo");
  });
});
