// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { sessionGrantSchema } from "@/lib/api/schemas/panel/account";
import { dashboardSchema, type Dashboard } from "@/lib/api/schemas/panel/home";
import { meSchema } from "@/lib/api/schemas/panel/me";
import {
  HOME_EMAILS,
  PANEL_PASSWORD,
  WEAK_PASSWORD,
} from "@/tests/fixtures/factories/panel";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { panelHomeControlHandlers } from "@/tests/fixtures/msw/handlers/panel-home";
import { server } from "@/tests/fixtures/msw/server";

// QA-owned shared fixtures (T129): the M8a mock answers PH1–PH6
// (contract-request.md § M8 additions C-M8-1/7/8/9) and QA's M8 fixture gaps
// G1, G2, G4, G5 and G7 for Início and Configurações (test plan 2026-10-10).
// Each response is parsed with the frontend's own schemas (T128).

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };
const SENTINEL = "MSG-BACKEND-NAO-EXIBIR";
const NEW_PASSWORD = "uma-senha-nova-bem-longa";

beforeEach(() => {
  server.use(...panelControlHandlers, ...panelHomeControlHandlers);
});

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...BFF,
      "content-type": "application/json",
      ...(token !== undefined && { authorization: `Bearer ${token}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

function control(method: string, path: string, body?: unknown) {
  return fetch(`${API}/__mock/panel${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

async function login(email: string, senha = PANEL_PASSWORD): Promise<string> {
  const response = await call("POST", "/v1/auth/login", undefined, {
    email,
    senha,
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { sessao: { id: string } }).sessao.id;
}

/** A fresh account with a dashboard preset (QA G1), logged in. */
async function seeded(preset: "populado" | "novo") {
  const email = `${preset}-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  const response = await control("POST", "/dashboard/seed", { email, preset });
  expect(response.status).toBe(201);
  return { email, token: await login(email) };
}

async function dashboard(token: string): Promise<Dashboard> {
  const response = await call("GET", "/v1/dashboard", token);
  expect(response.status).toBe(200);
  return dashboardSchema.parse(await response.json());
}

async function errorOf(response: Response) {
  return (await response.json()) as { code: string; message: string };
}

describe("D-H1 GET /v1/dashboard (C-M8-1)", () => {
  it("PH1: a populated dashboard passes the schema, every card present", async () => {
    const { token } = await seeded("populado");
    const body = await dashboard(token);
    expect(body.kpis?.verificados).toBeGreaterThan(0);
    expect(body.fila?.length).toBe(4);
    expect(body.alertas?.length).toBe(4);
    expect(body.semana).toHaveLength(7);
    expect(body.primeiros_passos).toEqual({
      lote: true,
      link: false,
      monitor: true,
      oculto: false,
    });
  });

  it("PH1: the queue is oldest first and the days are consecutive, oldest first", async () => {
    const { token } = await seeded("populado");
    const body = await dashboard(token);
    const criados = (body.fila ?? []).map((item) => item.criado_em);
    expect([...criados].sort()).toEqual(criados);
    const dias = (body.semana ?? []).map((day) => Date.parse(day.dia));
    for (let i = 1; i < dias.length; i++)
      expect((dias[i] ?? 0) - (dias[i - 1] ?? 0)).toBe(86_400_000);
  });

  it("G4: the cards carry MEI names with a CPF (formatted and bare) and a hostile name", async () => {
    const { token } = await seeded("populado");
    const body = await dashboard(token);
    const names = [
      ...(body.fila ?? []).map((item) => item.razao_social),
      ...(body.alertas ?? []).map((alert) => alert.seller.razao_social),
    ];
    expect(names).toContain("Fulano 123.456.789-09 ME");
    expect(names).toContain("Beltrano 12345678909");
    expect(names.some((name) => name?.includes("<img"))).toBe(true);
  });

  it("PH2: nada@ is a new workspace: all 0, steps all false, no cases or alerts", async () => {
    const token = await login(HOME_EMAILS.nada);
    const body = await dashboard(token);
    expect(body.kpis).toEqual({
      verificados: 0,
      auto: 0,
      revisao: 0,
      bloqueados: 0,
    });
    expect(body.fila).toEqual([]);
    expect(body.alertas).toEqual([]);
    expect(body.semana?.every((day) => day.total === 0)).toBe(true);
    expect(body.primeiros_passos).toEqual({
      lote: false,
      link: false,
      monitor: false,
      oculto: false,
    });
    const me = meSchema.parse(
      await (await call("GET", "/v1/me", token)).json(),
    );
    expect(me.workspace.onboarding_concluido).toBe(true);
    expect(me.workspace.contagens).toMatchObject({
      fila_abertos: 0,
      alertas_criticos_abertos: 0,
      vendedores: 0,
    });
  });

  it("PH3 (G2): an omit fault drops only the named fields", async () => {
    const { email, token } = await seeded("populado");
    expect(
      (
        await control("POST", "/dashboard/fault", {
          email,
          kind: "omit",
          sem: ["fila", "alertas", "semana"],
        })
      ).status,
    ).toBe(204);
    const body = await dashboard(token);
    expect(Object.keys(body).sort()).toEqual(["kpis", "primeiros_passos"]);
  });

  it("PH4 (G2): a 503 fault fails the whole call, with the sentinel, for `times` requests", async () => {
    const { email, token } = await seeded("populado");
    await control("POST", "/dashboard/fault", { email, kind: "503", times: 1 });
    const failed = await call("GET", "/v1/dashboard", token);
    expect(failed.status).toBe(503);
    expect((await errorOf(failed)).message).toBe(SENTINEL);
    expect((await call("GET", "/v1/dashboard", token)).status).toBe(200);
  });

  it("G2: a fault is per account; other accounts are untouched", async () => {
    const a = await seeded("populado");
    const b = await seeded("populado");
    await control("POST", "/dashboard/fault", { email: a.email, kind: "500" });
    expect((await call("GET", "/v1/dashboard", a.token)).status).toBe(500);
    expect((await call("GET", "/v1/dashboard", b.token)).status).toBe(200);
  });

  it("refuses a request with no session", async () => {
    expect((await call("GET", "/v1/dashboard")).status).toBe(401);
  });

  it("G5: the call log names the account", async () => {
    const { email, token } = await seeded("populado");
    await call("GET", "/v1/dashboard", token);
    const calls = (await (
      await control("GET", `/calls?email=${encodeURIComponent(email)}`)
    ).json()) as { path: string; email?: string }[];
    expect(calls.some((c) => c.path === "/v1/dashboard")).toBe(true);
  });
});

describe("D-H2 PUT /v1/dashboard/primeiros-passos (PH5)", () => {
  it("hides the card for good: 204, idempotent, and later reads say oculto", async () => {
    const { token } = await seeded("novo");
    for (let i = 0; i < 2; i++) {
      const response = await call(
        "PUT",
        "/v1/dashboard/primeiros-passos",
        token,
        { oculto: true },
      );
      expect(response.status).toBe(204);
    }
    expect((await dashboard(token)).primeiros_passos?.oculto).toBe(true);
  });

  it("refuses anything but { oculto: true }", async () => {
    const { token } = await seeded("novo");
    for (const body of [{ oculto: false }, {}, { oculto: true, lote: true }]) {
      const response = await call(
        "PUT",
        "/v1/dashboard/primeiros-passos",
        token,
        body,
      );
      expect(response.status).toBe(422);
    }
  });
});

describe("D-W3 / D-W4 settings (C-M8-8, C-M8-9)", () => {
  it("PUT /workspace saves the platform name, and D1 shows it with the contact", async () => {
    const { token } = await seeded("populado");
    const saved = await call("PUT", "/v1/workspace", token, {
      nome: "Plataforma Renomeada",
      contato_vendedor: { tipo: "email", valor: "ajuda@exemplo.test" },
    });
    expect(saved.status).toBe(200);
    const me = meSchema.parse(
      await (await call("GET", "/v1/me", token)).json(),
    );
    expect(me.workspace.nome).toBe("Plataforma Renomeada");
    const link = await fetch(`${API}/public/v/${me.workspace.slug}`);
    expect(link.status).toBe(200);
    expect(await link.json()).toEqual({
      nome: "Plataforma Renomeada",
      contato_vendedor: { tipo: "email", valor: "ajuda@exemplo.test" },
    });
  });

  it.each([[""], ["   "], ["a".repeat(81)]])(
    "PUT /workspace refuses the name %j with 422 VALOR_INVALIDO field nome",
    async (nome) => {
      const { token } = await seeded("populado");
      const response = await call("PUT", "/v1/workspace", token, { nome });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: "VALOR_INVALIDO",
        field: "nome",
      });
    },
  );

  it("PUT /me saves the own name and answers the D-W1 object", async () => {
    const { token } = await seeded("populado");
    const response = await call("PUT", "/v1/me", token, { nome: "Nome Novo" });
    expect(response.status).toBe(200);
    expect(meSchema.parse(await response.json()).nome).toBe("Nome Novo");
  });

  it.each([[{ nome: "" }], [{ nome: "a".repeat(81) }], [{}]])(
    "PUT /me refuses %j",
    async (body) => {
      const { token } = await seeded("populado");
      expect((await call("PUT", "/v1/me", token, body)).status).toBe(422);
    },
  );

  it("G2 partial save: a me-put fault fails /me while /workspace saves", async () => {
    const { email, token } = await seeded("populado");
    await control("POST", "/settings-fault", {
      email,
      endpoint: "me-put",
      kind: "503",
      times: 1,
    });
    expect(
      (await call("PUT", "/v1/workspace", token, { nome: "Parcial" })).status,
    ).toBe(200);
    expect((await call("PUT", "/v1/me", token, { nome: "X" })).status).toBe(
      503,
    );
    expect((await call("PUT", "/v1/me", token, { nome: "X" })).status).toBe(
      200,
    );
  });
});

describe("D-A6 POST /v1/auth/password (PH6, C-M8-7, O-F1)", () => {
  async function fresh() {
    const { email, token } = await seeded("populado");
    return { email, token };
  }

  it("a wrong current password is a 403 SENHA_ATUAL_INCORRETA, never a 401, and the session survives", async () => {
    const { token } = await fresh();
    const response = await call("POST", "/v1/auth/password", token, {
      senha_atual: "nao-e-esta",
      senha_nova: NEW_PASSWORD,
    });
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toEqual({
      code: "SENHA_ATUAL_INCORRETA",
      message: SENTINEL,
    });
    expect((await call("GET", "/v1/me", token)).status).toBe(200);
  });

  it.each([[WEAK_PASSWORD], ["curta"], ["a".repeat(129)]])(
    "the new password %j is a 422 SENHA_FRACA",
    async (senha_nova) => {
      const { token } = await fresh();
      const response = await call("POST", "/v1/auth/password", token, {
        senha_atual: PANEL_PASSWORD,
        senha_nova,
      });
      expect(response.status).toBe(422);
      expect((await errorOf(response)).code).toBe("SENHA_FRACA");
    },
  );

  it("the 6th failure in 15 minutes is a 429 with Retry-After", async () => {
    const { token } = await fresh();
    const wrong = { senha_atual: "errada", senha_nova: NEW_PASSWORD };
    for (let i = 0; i < 5; i++)
      expect(
        (await call("POST", "/v1/auth/password", token, wrong)).status,
      ).toBe(403);
    const limited = await call("POST", "/v1/auth/password", token, wrong);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await errorOf(limited)).code).toBe("LIMITE_TENTATIVAS");
  });

  it("success: a new session, every other session revoked, the mail sent, the new password works", async () => {
    const { email, token } = await fresh();
    const other = await login(email);
    const response = await call("POST", "/v1/auth/password", token, {
      senha_atual: PANEL_PASSWORD,
      senha_nova: NEW_PASSWORD,
    });
    expect(response.status).toBe(200);
    const { sessao } = sessionGrantSchema.parse(await response.json());
    expect(sessao.id).not.toBe(token);
    expect((await call("GET", "/v1/me", sessao.id)).status).toBe(200);
    expect((await call("GET", "/v1/me", token)).status).toBe(401);
    expect((await call("GET", "/v1/me", other)).status).toBe(401);
    const mail = (await (
      await control("GET", `/outbox?email=${encodeURIComponent(email)}`)
    ).json()) as { avisos?: string[] };
    expect(mail.avisos).toContain("mail.password_changed");
    await login(email, NEW_PASSWORD);
  });

  it("the rotated session keeps the original absolute deadline", async () => {
    const { email } = await fresh();
    const first = await call("POST", "/v1/auth/login", undefined, {
      email,
      senha: PANEL_PASSWORD,
    });
    const original = sessionGrantSchema.parse(await first.json()).sessao;
    const response = await call("POST", "/v1/auth/password", original.id, {
      senha_atual: PANEL_PASSWORD,
      senha_nova: NEW_PASSWORD,
    });
    const rotated = sessionGrantSchema.parse(await response.json()).sessao;
    expect(rotated.expira_em).toBe(original.expira_em);
  });

  it("G7: the sessions read shows the rotation and the revocations, with no session values", async () => {
    const { email, token } = await fresh();
    await login(email);
    const response = await call("POST", "/v1/auth/password", token, {
      senha_atual: PANEL_PASSWORD,
      senha_nova: NEW_PASSWORD,
    });
    const { sessao } = sessionGrantSchema.parse(await response.json());
    const read = await control(
      "GET",
      `/sessions?email=${encodeURIComponent(email)}`,
    );
    const text = await read.text();
    expect(text).not.toContain(token);
    expect(text).not.toContain(sessao.id);
    const sessions = JSON.parse(text) as { ref: string; revogada: boolean }[];
    expect(sessions.filter((s) => s.revogada)).toHaveLength(2);
    expect(sessions.filter((s) => !s.revogada)).toHaveLength(1);
    const digest = async (id: string) =>
      Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id)),
      )
        .toString("hex")
        .slice(0, 16);
    expect(sessions.find((s) => !s.revogada)?.ref).toBe(
      await digest(sessao.id),
    );
  });

  it("G5: the call log keeps the body keys, never the password values", async () => {
    const { email, token } = await fresh();
    await call("POST", "/v1/auth/password", token, {
      senha_atual: "valor-secreto-atual",
      senha_nova: "valor-secreto-novo-longo",
    });
    const text = await (
      await control("GET", `/calls?email=${encodeURIComponent(email)}`)
    ).text();
    expect(text).toContain("senha_atual");
    expect(text).not.toContain("valor-secreto");
  });
});
