// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
  FOREIGN_CASE_ID,
  IDLE_TTL_MS,
  PANEL_EMAILS,
  PANEL_PASSWORD,
  SESSION_TTL_MS,
  TURNSTILE_TOKENS,
} from "@/tests/fixtures/factories/panel";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { server } from "@/tests/fixtures/msw/server";

// QA's M4 fixture gaps (docs/qa/2026-10-04_panel-access-m4_test-plan.md
// § Test Data Needs, G1–G10).

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };

beforeEach(() => {
  server.use(...panelControlHandlers);
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { ...BFF, "content-type": "application/json", ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function control(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}/__mock/panel${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function login(
  email: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await call(
    "POST",
    "/v1/auth/login",
    { email, senha: PANEL_PASSWORD },
    headers,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { sessao: { id: string } }).sessao.id;
}

const me = (token: string, headers: Record<string, string> = {}) =>
  call("GET", "/v1/me", undefined, {
    authorization: `Bearer ${token}`,
    ...headers,
  });

describe("G1: a per-session clock (12 h idle, 7 d absolute)", () => {
  it("expira_em is creation + 7 days", async () => {
    const response = await call("POST", "/v1/auth/login", {
      email: PANEL_EMAILS.renata,
      senha: PANEL_PASSWORD,
    });
    const { sessao } = (await response.json()) as {
      sessao: { expira_em: string };
    };
    expect(Date.parse(sessao.expira_em) - Date.now()).toBeGreaterThan(
      SESSION_TTL_MS - 5_000,
    );
  });

  it("aging a session past 12 h of idle ends it; a request keeps it alive", async () => {
    const token = await login(PANEL_EMAILS.renata);
    await control("POST", "/age-session", {
      id: token,
      idleMs: IDLE_TTL_MS - 60_000,
    });
    expect((await me(token)).status).toBe(200);
    // That request slid the idle clock: aging by the same amount again is fine.
    await control("POST", "/age-session", {
      id: token,
      idleMs: IDLE_TTL_MS - 60_000,
    });
    expect((await me(token)).status).toBe(200);

    await control("POST", "/age-session", {
      id: token,
      idleMs: IDLE_TTL_MS + 1,
    });
    expect((await me(token)).status).toBe(401);
  });

  it("past 7 days it ends, however active", async () => {
    const token = await login(PANEL_EMAILS.renata);
    await control("POST", "/age-session", {
      id: token,
      ageMs: SESSION_TTL_MS + 1,
    });
    expect((await me(token)).status).toBe(401);
  });

  it("a poll (X-Kybr-Poll: 1) doesn't slide the idle clock (Q decision)", async () => {
    const token = await login(PANEL_EMAILS.renata);
    await control("POST", "/age-session", {
      id: token,
      idleMs: IDLE_TTL_MS - 60_000,
    });
    expect((await me(token, { "x-kybr-poll": "1" })).status).toBe(200);
    await control("POST", "/age-session", { id: token, idleMs: 120_000 });
    expect((await me(token)).status).toBe(401);
  });
});

describe("G2: parallel isolation", () => {
  it("logs the client IP, the body keys and the Turnstile value; filters by ip", async () => {
    await call(
      "POST",
      "/v1/auth/password-reset",
      { email: "ip@exemplo.test", turnstile: TURNSTILE_TOKENS.pass },
      { "x-kybr-client-ip": "198.51.100.7" },
    );

    const calls = (await (
      await control("GET", "/calls?ip=198.51.100.7")
    ).json()) as Record<string, unknown>[];
    expect(calls).toEqual([
      expect.objectContaining({
        path: "/v1/auth/password-reset",
        ip: "198.51.100.7",
        bodyKeys: ["email", "turnstile"],
        turnstile: TURNSTILE_TOKENS.pass,
        authorized: false,
      }),
    ]);
  });

  it("G5: the 428 counter is keyed on e-mail + IP and applies to unknown addresses too", async () => {
    const unknown = { email: "nao-existe@exemplo.test", senha: "errada-1" };
    const ipA = { "x-kybr-client-ip": "198.51.100.1" };
    for (let attempt = 0; attempt < 3; attempt++)
      await call("POST", "/v1/auth/login", unknown, ipA);

    expect((await call("POST", "/v1/auth/login", unknown, ipA)).status).toBe(
      428,
    );
    // Another IP has its own count.
    expect(
      (
        await call("POST", "/v1/auth/login", unknown, {
          "x-kybr-client-ip": "198.51.100.2",
        })
      ).status,
    ).toBe(401);
  });

  it("G5: an unconfirmed account with a wrong password reads as wrong credentials", async () => {
    const response = await call("POST", "/v1/auth/login", {
      email: PANEL_EMAILS.pendente,
      senha: "errada-1",
    });
    expect(response.status).toBe(401);
  });
});

describe("G3: more scenarios", () => {
  async function onboardingAccount(email: string): Promise<string> {
    await control("POST", "/accounts", { email, preset: "nova" });
    return login(email);
  }
  const save = (token: string) =>
    call(
      "PUT",
      "/v1/workspace",
      {
        contato_vendedor: { tipo: "email", valor: "s@exemplo.test" },
        categoria: "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e01",
      },
      { authorization: `Bearer ${token}` },
    );

  it("PUT /workspace: 500, a dropped connection, and 422 with a field", async () => {
    const token = await onboardingAccount("ws@exemplo.test");
    await control("POST", "/seed", {
      scenario: "workspace-falha",
      email: "ws@exemplo.test",
    });
    expect((await save(token)).status).toBe(500);

    await control("POST", "/unseed", {
      scenario: "workspace-falha",
      email: "ws@exemplo.test",
    });
    await control("POST", "/seed", {
      scenario: "workspace-invalido",
      email: "ws@exemplo.test",
    });
    const invalid = await save(token);
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      code: "VALOR_INVALIDO",
      field: "contato_vendedor.valor",
    });

    await control("POST", "/unseed", {
      scenario: "workspace-invalido",
      email: "ws@exemplo.test",
    });
    await control("POST", "/seed", {
      scenario: "workspace-queda",
      email: "ws@exemplo.test",
    });
    await expect(save(token)).rejects.toThrow();
  });

  it("categories can be slow (the skeleton shows)", async () => {
    const token = await onboardingAccount("lento@exemplo.test");
    await control("POST", "/seed", {
      scenario: "categorias-lentas",
      email: "lento@exemplo.test",
    });
    const start = Date.now();
    await call("GET", "/v1/categories", undefined, {
      authorization: `Bearer ${token}`,
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(1_000);
  });

  it("logout can fail with a 500 (the cookie is still deleted)", async () => {
    await control("POST", "/accounts", { email: "sai@exemplo.test" });
    const token = await login("sai@exemplo.test");
    await control("POST", "/seed", {
      scenario: "logout-falha",
      email: "sai@exemplo.test",
    });
    expect(
      (
        await call("POST", "/v1/auth/logout", undefined, {
          authorization: `Bearer ${token}`,
        })
      ).status,
    ).toBe(500);
  });

  it("contagens can fail for one account, then recover", async () => {
    await control("POST", "/accounts", { email: "cont@exemplo.test" });
    const token = await login("cont@exemplo.test");
    await control("POST", "/seed", {
      scenario: "contagens-falham",
      email: "cont@exemplo.test",
    });
    expect(
      ((await (await me(token)).json()) as { workspace: object }).workspace,
    ).not.toHaveProperty("contagens");

    await control("POST", "/unseed", {
      scenario: "contagens-falham",
      email: "cont@exemplo.test",
    });
    expect(
      ((await (await me(token)).json()) as { workspace: object }).workspace,
    ).toHaveProperty("contagens");
  });

  it.each([
    ["tres-abertos", { fila_abertos: 3, fila_vencidos: 0 }],
    ["um-aberto", { fila_abertos: 1, fila_vencidos: 0 }],
    [
      "zerado",
      {
        fila_abertos: 0,
        fila_vencidos: 0,
        vendedores: 0,
        alertas_criticos_abertos: 0,
      },
    ],
    ["um-vendedor", { vendedores: 1 }],
  ])("the %s preset", async (preset, counts) => {
    const email = `${preset}@exemplo.test`;
    await control("POST", "/accounts", { email, preset });
    const body = (await (await me(await login(email))).json()) as {
      workspace: { contagens: object };
    };
    expect(body.workspace.contagens).toMatchObject(counts);
  });
});

describe("G6: a second workspace", () => {
  it("outro@ owns a known case id that no other workspace sees", async () => {
    expect(FOREIGN_CASE_ID).toMatch(/^[0-9a-f-]{36}$/);
    const token = await login(PANEL_EMAILS.outro);
    const body = (await (await me(token)).json()) as {
      workspace: { nome: string };
    };
    expect(body.workspace.nome).toBe("Outra Plataforma");
  });
});

describe("G9: rotation, the previous session presented at login is revoked", () => {
  it("a login that presents its old session id ends it", async () => {
    const old = await login(PANEL_EMAILS.renata);
    const fresh = await login(PANEL_EMAILS.renata, {
      authorization: `Bearer ${old}`,
    });

    expect(fresh).not.toBe(old);
    expect((await me(old)).status).toBe(401);
    expect((await me(fresh)).status).toBe(200);
  });
});
