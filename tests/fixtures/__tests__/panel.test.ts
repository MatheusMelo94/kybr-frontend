// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CODES,
  ERROR_SENTINEL,
  EXPIRED_RESET_TOKEN,
  MAX_CODE_ATTEMPTS,
  NETWORK_DROP_PASSWORD,
  PANEL_EMAILS,
  PANEL_PASSWORD,
  PANEL_RETRY_AFTER_SECONDS,
  TURNSTILE_TOKENS,
  WEAK_PASSWORD,
} from "@/tests/fixtures/factories/panel";
import { panelControlHandlers } from "@/tests/fixtures/msw/handlers/panel-auth";
import { server } from "@/tests/fixtures/msw/server";

// QA-owned shared fixtures (T45): the panel's Pre-Contract mock answers every
// M4 scenario of contract-request.md (PA1–PA19) by its documented key.

const API = "http://api.kybr.test";
const BFF = { "x-kybr-bff-key": "test-only-bff-key-0123456789abcdef" };
const PASS = TURNSTILE_TOKENS.pass;

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

async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

/** Asserts the A-X2 envelope (sentinel message, request id) and returns the code. */
async function errorCode(response: Response): Promise<string> {
  const body = await json(response);
  expect(body.message).toBe(ERROR_SENTINEL);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  if (response.status === 429)
    expect(response.headers.get("retry-after")).toBe(
      String(PANEL_RETRY_AFTER_SECONDS),
    );
  return String(body.code);
}

function signupBody(
  email: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    nome: "Pessoa Exemplo",
    workspace: "Plataforma Exemplo",
    email,
    senha: "senha-nova-segura-1",
    aceite_termos_versao: "teste-1",
    turnstile: PASS,
    ...extra,
  };
}

async function login(email: string, senha = PANEL_PASSWORD): Promise<string> {
  const response = await call("POST", "/v1/auth/login", { email, senha });
  expect(response.status).toBe(200);
  return (await json<{ sessao: { id: string } }>(response)).sessao.id;
}

describe("panel mock: sign-up and confirm (PA1–PA5, PA19)", () => {
  it("PA1: a new address gets a ticket and a code in the outbox; the code opens a session", async () => {
    const email = "pa1@exemplo.test";
    const signup = await call("POST", "/v1/auth/signup", signupBody(email), {
      "idempotency-key": crypto.randomUUID(),
    });
    expect(signup.status).toBe(202);
    const { signup_ticket, reenviar_em } = await json<{
      signup_ticket: string;
      reenviar_em: string;
    }>(signup);
    expect(signup_ticket).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(Date.parse(reenviar_em)).toBeGreaterThan(Date.now());

    const { codigo } = await json<{ codigo: string }>(
      await control("GET", `/outbox?to=${email}`),
    );
    expect(codigo).toMatch(/^\d{6}$/);
    const confirm = await call("POST", "/v1/auth/confirm", {
      signup_ticket,
      codigo,
    });
    expect(confirm.status).toBe(200);
    const { sessao } = await json<{
      sessao: { id: string; expira_em: string };
    }>(confirm);
    expect(sessao.id).toMatch(/^[A-Za-z0-9_-]{22,}$/);

    const me = await call("GET", "/v1/me", undefined, {
      authorization: `Bearer ${sessao.id}`,
    });
    expect(me.status).toBe(200);
    expect(await json(me)).toMatchObject({
      email,
      workspace: { nome: "Plataforma Exemplo", onboarding_concluido: false },
    });
  });

  it("A-X7: a double tap with one Idempotency-Key creates one account", async () => {
    const email = "dobro@exemplo.test";
    const key = crypto.randomUUID();
    const [first, second] = await Promise.all([
      call("POST", "/v1/auth/signup", signupBody(email), {
        "idempotency-key": key,
      }),
      call("POST", "/v1/auth/signup", signupBody(email), {
        "idempotency-key": key,
      }),
    ]);

    expect([first.status, second.status]).toEqual([202, 202]);
    expect(await json(await control("GET", `/signups?email=${email}`))).toEqual(
      { count: 1 },
    );
  });

  it.each([
    ["PA2", signupBody(PANEL_EMAILS.existente), 409, "EMAIL_EM_USO"],
    ["PA3", signupBody(PANEL_EMAILS.limite), 429, "LIMITE_TENTATIVAS"],
    [
      "PA4",
      signupBody("fraca@exemplo.test", { senha: WEAK_PASSWORD }),
      422,
      "SENHA_FRACA",
    ],
    [
      "PA18",
      signupBody("pa18@exemplo.test", { turnstile: TURNSTILE_TOKENS.fail }),
      400,
      "TURNSTILE_INVALIDO",
    ],
    [
      "no Turnstile token",
      signupBody("sem@exemplo.test", { turnstile: undefined }),
      400,
      "TURNSTILE_INVALIDO",
    ],
    [
      "PA19 disposable",
      signupBody("x@descartavel.test"),
      403,
      "TESTE_INDISPONIVEL",
    ],
  ])("%s: sign-up answers %s %s", async (_, body, status, code) => {
    const response = await call("POST", "/v1/auth/signup", body);

    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
  });

  it("PA4 points SENHA_FRACA at the senha field", async () => {
    const response = await call(
      "POST",
      "/v1/auth/signup",
      signupBody("fraca2@exemplo.test", { senha: WEAK_PASSWORD }),
    );
    expect((await json(response)).field).toBe("senha");
  });

  it("PA19 paused: the teste-pausado seed answers 503, scoped to one e-mail", async () => {
    await control("POST", "/seed", {
      scenario: "teste-pausado",
      email: "pausado@exemplo.test",
    });

    const paused = await call(
      "POST",
      "/v1/auth/signup",
      signupBody("pausado@exemplo.test"),
    );
    expect(paused.status).toBe(503);
    expect(await errorCode(paused)).toBe("TESTE_PAUSADO");
    expect(
      (await call("POST", "/v1/auth/signup", signupBody("outro@exemplo.test")))
        .status,
    ).toBe(202);
  });

  it("PA16: the network-drop password drops the connection", async () => {
    await expect(
      call(
        "POST",
        "/v1/auth/signup",
        signupBody("queda@exemplo.test", { senha: NETWORK_DROP_PASSWORD }),
      ),
    ).rejects.toThrow();
  });

  it("PA5: 000000 is wrong, 111111 expired, and the 6th wrong attempt is rate-limited", async () => {
    const email = "pa5@exemplo.test";
    const { signup_ticket } = await json<{ signup_ticket: string }>(
      await call("POST", "/v1/auth/signup", signupBody(email)),
    );

    const expired = await call("POST", "/v1/auth/confirm", {
      signup_ticket,
      codigo: CODES.expired,
    });
    expect(await errorCode(expired)).toBe("CODIGO_EXPIRADO");
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const wrong = await call("POST", "/v1/auth/confirm", {
        signup_ticket,
        codigo: CODES.wrong,
      });
      expect(wrong.status).toBe(400);
      expect(await errorCode(wrong)).toBe("CODIGO_INCORRETO");
    }
    const sixth = await call("POST", "/v1/auth/confirm", {
      signup_ticket,
      codigo: CODES.wrong,
    });
    expect(sixth.status).toBe(429);
    expect(await errorCode(sixth)).toBe("LIMITE_TENTATIVAS");
  });

  it("D-A3: resend needs Turnstile, mails a new code, and PA3 rate-limits it", async () => {
    const email = "reenvio@exemplo.test";
    const { signup_ticket } = await json<{ signup_ticket: string }>(
      await call("POST", "/v1/auth/signup", signupBody(email)),
    );
    const before = await json<{ codigo: string }>(
      await control("GET", `/outbox?to=${email}`),
    );

    expect(
      (await call("POST", "/v1/auth/confirm/resend", { signup_ticket })).status,
    ).toBe(400);
    const resent = await call("POST", "/v1/auth/confirm/resend", {
      signup_ticket,
      turnstile: PASS,
    });
    expect(resent.status).toBe(202);
    const after = await json<{ codigo: string }>(
      await control("GET", `/outbox?to=${email}`),
    );
    expect(after.codigo).toMatch(/^\d{6}$/);
    // The old code is dead once a new one is out.
    expect(
      (
        await call("POST", "/v1/auth/confirm", {
          signup_ticket,
          codigo: before.codigo,
        })
      ).status,
    ).toBe(before.codigo === after.codigo ? 200 : 400);
  });
});

describe("panel mock: login, logout, sessions (PA6–PA12, PA15, PA17)", () => {
  it("PA6: rotation, a new session id on every login", async () => {
    const first = await login(PANEL_EMAILS.renata);
    const second = await login(PANEL_EMAILS.renata);

    expect(second).not.toBe(first);
  });

  it("PA8: a wrong password and an unknown e-mail both answer CREDENCIAIS_INVALIDAS", async () => {
    for (const body of [
      { email: PANEL_EMAILS.renata, senha: "errada-errada-1" },
      { email: "ninguem-aqui@exemplo.test", senha: "errada-errada-1" },
    ]) {
      const response = await call("POST", "/v1/auth/login", body);
      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe("CREDENCIAIS_INVALIDAS");
    }
  });

  it("PA9: an unconfirmed account answers 403 with a ticket, after the password checks out, and mails a code", async () => {
    const wrong = await call("POST", "/v1/auth/login", {
      email: PANEL_EMAILS.pendente,
      senha: "x",
    });
    expect(wrong.status).toBe(401);

    const response = await call("POST", "/v1/auth/login", {
      email: PANEL_EMAILS.pendente,
      senha: PANEL_PASSWORD,
    });
    expect(response.status).toBe(403);
    const body = await json(response);
    expect(body).toMatchObject({
      code: "EMAIL_NAO_CONFIRMADO",
      message: ERROR_SENTINEL,
    });
    expect(String(body.signup_ticket)).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(
      (await control("GET", `/outbox?to=${PANEL_EMAILS.pendente}`)).status,
    ).toBe(200);
  });

  it("PA3: login is rate-limited for the limite address", async () => {
    const response = await call("POST", "/v1/auth/login", {
      email: PANEL_EMAILS.limite,
      senha: PANEL_PASSWORD,
    });
    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("LIMITE_TENTATIVAS");
  });

  it("PA17: after 3 failures the 4th attempt without a token is 428; with the token it goes through", async () => {
    await control("POST", "/accounts", { email: "pa17@exemplo.test" });
    for (let attempt = 0; attempt < 3; attempt++)
      await call("POST", "/v1/auth/login", {
        email: "pa17@exemplo.test",
        senha: "errada",
      });

    const blocked = await call("POST", "/v1/auth/login", {
      email: "pa17@exemplo.test",
      senha: PANEL_PASSWORD,
    });
    expect(blocked.status).toBe(428);
    expect(await errorCode(blocked)).toBe("TURNSTILE_REQUERIDO");

    const rejected = await call("POST", "/v1/auth/login", {
      email: "pa17@exemplo.test",
      senha: PANEL_PASSWORD,
      turnstile: TURNSTILE_TOKENS.fail,
    });
    expect(await errorCode(rejected)).toBe("TURNSTILE_INVALIDO");

    const passed = await call("POST", "/v1/auth/login", {
      email: "pa17@exemplo.test",
      senha: PANEL_PASSWORD,
      turnstile: PASS,
    });
    expect(passed.status).toBe(200);
  });

  it("PA15: logout revokes the session; the old token then gets 401, and the logout is recorded", async () => {
    const token = await login(PANEL_EMAILS.renata);
    const bearer = { authorization: `Bearer ${token}` };

    expect(
      (await call("POST", "/v1/auth/logout", undefined, bearer)).status,
    ).toBe(204);
    const me = await call("GET", "/v1/me", undefined, bearer);
    expect(me.status).toBe(401);
    expect(await errorCode(me)).toBe("SESSAO_EXPIRADA");
    expect(
      await json(await control("GET", `/logouts?email=${PANEL_EMAILS.renata}`)),
    ).toEqual({ count: 1 });
    // Idempotent: an already-revoked id is still 204.
    expect(
      (await call("POST", "/v1/auth/logout", undefined, bearer)).status,
    ).toBe(204);
  });

  it("PA12: expire-session ends a session mid-task", async () => {
    const token = await login(PANEL_EMAILS.renata);
    await control("POST", "/expire-session", { id: token });

    expect(
      (
        await call("GET", "/v1/me", undefined, {
          authorization: `Bearer ${token}`,
        })
      ).status,
    ).toBe(401);
  });

  it.each(["/v1/me", "/v1/categories"])(
    "%s needs Authorization: Bearer (401 otherwise)",
    async (path) => {
      const response = await call("GET", path);
      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe("SESSAO_EXPIRADA");
    },
  );

  it.each([
    ["GET", "/v1/me"],
    ["POST", "/v1/auth/login"],
    ["POST", "/v1/auth/signup"],
  ])("%s %s needs the BFF key", async (method, path) => {
    const response = await fetch(`${API}${path}`, {
      method,
      ...(method === "POST" && { body: "{}" }),
    });
    expect(response.status).toBe(403);
  });
});

describe("panel mock: /me and the workspace (PA6, PA7, PA10, PA11, PA13, D-W3)", () => {
  async function me(email: string): Promise<Record<string, unknown>> {
    const token = await login(email);
    return json(
      await call("GET", "/v1/me", undefined, {
        authorization: `Bearer ${token}`,
      }),
    );
  }

  it("PA6: renata is onboarded, on a trial, with counts and 2 overdue cases", async () => {
    expect(await me(PANEL_EMAILS.renata)).toMatchObject({
      nome: expect.any(String),
      email: PANEL_EMAILS.renata,
      workspace: {
        onboarding_concluido: true,
        link_url: expect.stringMatching(
          /^https:\/\/kybr\.com\.br\/v\/[a-z0-9-]+$/,
        ),
        plano: { tipo: "teste" },
        contagens: { fila_vencidos: 2 },
      },
    });
  });

  it("PA7: nova hasn't onboarded", async () => {
    expect(await me(PANEL_EMAILS.nova)).toMatchObject({
      workspace: {
        onboarding_concluido: false,
        contato_vendedor: null,
        categoria: null,
      },
    });
  });

  it("PA10: parcial's /me has neither contagens nor plano", async () => {
    const workspace = (await me(PANEL_EMAILS.parcial)).workspace as Record<
      string,
      unknown
    >;
    expect(workspace).not.toHaveProperty("contagens");
    expect(workspace).not.toHaveProperty("plano");
  });

  it("PA11: esgotado's allowance is used up; pago is on a paid plan", async () => {
    const esgotado = (await me(PANEL_EMAILS.esgotado)).workspace as {
      plano: { usadas: number; limite: number };
    };
    expect(esgotado.plano.usadas).toBe(esgotado.plano.limite);
    expect(await me(PANEL_EMAILS.pago)).toMatchObject({
      workspace: {
        plano: {
          tipo: "pago",
          nome: expect.any(String),
          ciclo_ate: expect.any(String),
        },
      },
    });
  });

  it("D-W2 / PA13: categories load, and fail with 500 under the categorias-falham seed", async () => {
    await control("POST", "/accounts", {
      email: "pa13@exemplo.test",
      preset: "nova",
    });
    const token = await login("pa13@exemplo.test");
    const bearer = { authorization: `Bearer ${token}` };

    expect(
      await json(await call("GET", "/v1/categories", undefined, bearer)),
    ).toEqual(CATEGORIES);
    await control("POST", "/seed", {
      scenario: "categorias-falham",
      email: "pa13@exemplo.test",
    });
    const failed = await call("GET", "/v1/categories", undefined, bearer);
    expect(failed.status).toBe(500);
    await errorCode(failed);
  });

  it("D-W3: saving the contact and category completes onboarding; bad values are 422 with a field", async () => {
    await control("POST", "/accounts", {
      email: "dw3@exemplo.test",
      preset: "nova",
    });
    const bearer = {
      authorization: `Bearer ${await login("dw3@exemplo.test")}`,
    };

    const bad = await call(
      "PUT",
      "/v1/workspace",
      { contato_vendedor: { tipo: "url", valor: "http://x.example" } },
      bearer,
    );
    expect(bad.status).toBe(422);
    expect(await json(bad)).toMatchObject({
      code: "VALOR_INVALIDO",
      field: "contato_vendedor.valor",
    });

    const saved = await call(
      "PUT",
      "/v1/workspace",
      {
        contato_vendedor: { tipo: "url", valor: "https://ajuda.exemplo.test" },
        categoria: CATEGORIES[1].id,
      },
      bearer,
    );
    expect(saved.status).toBe(200);
    expect(await json(saved)).toMatchObject({
      onboarding_concluido: true,
      categoria: CATEGORIES[1].id,
    });
  });
});

describe("panel mock: password reset (PA14)", () => {
  it("answers 202 for an existing and an unknown e-mail alike; only the existing one gets a fragment link", async () => {
    const existing = await call("POST", "/v1/auth/password-reset", {
      email: PANEL_EMAILS.renata,
      turnstile: PASS,
    });
    const unknown = await call("POST", "/v1/auth/password-reset", {
      email: PANEL_EMAILS.ninguem,
      turnstile: PASS,
    });

    expect([existing.status, unknown.status]).toEqual([202, 202]);
    const { link } = await json<{ link: string }>(
      await control("GET", `/outbox?to=${PANEL_EMAILS.renata}`),
    );
    expect(link).toMatch(/^\/senha\/nova#t=[A-Za-z0-9_-]{22,128}$/);
    expect(
      (await control("GET", `/outbox?to=${PANEL_EMAILS.ninguem}`)).status,
    ).toBe(404);
  });

  it("a valid token sets the password once, revokes every session, and is then used", async () => {
    const old = await login(PANEL_EMAILS.renata);
    await call("POST", "/v1/auth/password-reset", {
      email: PANEL_EMAILS.renata,
      turnstile: PASS,
    });
    const { link } = await json<{ link: string }>(
      await control("GET", `/outbox?to=${PANEL_EMAILS.renata}`),
    );
    const token = link.split("#t=")[1];

    const done = await call("POST", "/v1/auth/password-reset/confirm", {
      token,
      senha: "outra-senha-boa-1",
    });
    expect(done.status).toBe(204);
    expect(
      (
        await call("GET", "/v1/me", undefined, {
          authorization: `Bearer ${old}`,
        })
      ).status,
    ).toBe(401);
    await login(PANEL_EMAILS.renata, "outra-senha-boa-1");

    const reused = await call("POST", "/v1/auth/password-reset/confirm", {
      token,
      senha: "mais-uma-senha-1",
    });
    expect(await errorCode(reused)).toBe("TOKEN_INVALIDO");
  });

  it("the expired-token key answers TOKEN_INVALIDO", async () => {
    const response = await call("POST", "/v1/auth/password-reset/confirm", {
      token: EXPIRED_RESET_TOKEN,
      senha: "outra-senha-boa-1",
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("TOKEN_INVALIDO");
  });
});

describe("panel mock: controls", () => {
  it("logs calls with path and query only, the body's e-mail and Turnstile token, never the password", async () => {
    await call("POST", "/v1/auth/password-reset", {
      email: "log@exemplo.test",
      turnstile: PASS,
    });

    const calls = await json<Record<string, unknown>[]>(
      await control("GET", "/calls?email=log@exemplo.test"),
    );
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/v1/auth/password-reset",
        email: "log@exemplo.test",
        turnstile: PASS,
        authorized: false,
      },
    ]);
  });

  it("reset clears sessions, mail and the log", async () => {
    const token = await login(PANEL_EMAILS.renata);
    await control("POST", "/reset");

    expect(
      (
        await call("GET", "/v1/me", undefined, {
          authorization: `Bearer ${token}`,
        })
      ).status,
    ).toBe(401);
    expect(await json(await control("GET", "/calls"))).toEqual([
      expect.objectContaining({ path: "/v1/me" }),
    ]);
  });

  it("uses only synthetic addresses", () => {
    for (const email of Object.values(PANEL_EMAILS))
      expect(email).toMatch(/@exemplo\.test$/);
  });
});
