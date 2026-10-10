import { http, HttpResponse, type RequestHandler } from "msw";

import {
  CODES,
  DISPOSABLE_DOMAIN,
  EXPIRED_RESET_TOKEN,
  FAILURES_BEFORE_TURNSTILE,
  MAX_CODE_ATTEMPTS,
  NETWORK_DROP_PASSWORD,
  PANEL_EMAILS,
  PRESETS,
  RESEND_AFTER_SECONDS,
  TURNSTILE_TOKENS,
  WEAK_PASSWORD,
  workspaceFor,
  type Preset,
} from "../../factories/panel.ts";
import {
  ageSession,
  clearPasswordFailures,
  createAccount,
  expireSession,
  issueResetToken,
  issueTicket,
  openSession,
  panelStore,
  passwordLimited,
  recordPasswordFailure,
  reissueCode,
  resetPanelMock,
  revokeSessionsOf,
  rotateSessionsOf,
  scenarioApplies,
  seedPollFailures,
  seedScenario,
  sendNotice,
  sessionAccount,
  unseedScenario,
  type Scenario,
} from "../panel-store.ts";
import {
  apiError,
  incoming,
  networkDrop,
  noContent,
  ok,
  str,
  turnstileProblem,
} from "./panel-common.ts";
import { homeAuthed } from "./panel-home.ts";

// Pre-Contract handlers for D-A1–D-A5 (ops-panel contract-request.md, M4).
// One set serves Vitest (server.ts) and the HTTP mock API (mock-api.ts).

const EMAIL = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

function reenviarEm(): string {
  return new Date(Date.now() + RESEND_AFTER_SECONDS * 1000).toISOString();
}

const signup = http.post("*/v1/auth/signup", async ({ request }) => {
  const { body, refused } = await incoming(request);
  if (refused) return refused;
  const store = panelStore();

  // A-X7: the same key and body replay the first answer; another body is 422.
  const key = request.headers.get("idempotency-key") ?? "";
  const fingerprint = JSON.stringify(body);
  const replay = store.idempotency.get(key);
  if (key && replay) {
    if (replay.fingerprint !== fingerprint)
      return apiError(422, "VALOR_INVALIDO");
    return ok(replay.reply, 202);
  }

  const email = str(body.email).trim().toLowerCase();
  const senha = str(body.senha);
  const nome = str(body.nome).trim();
  const workspace = str(body.workspace).trim();
  const problem = turnstileProblem(body);
  if (problem) return problem;
  if (email === PANEL_EMAILS.limite) return apiError(429, "LIMITE_TENTATIVAS");
  if (senha === NETWORK_DROP_PASSWORD) return networkDrop();
  if (email.endsWith(`@${DISPOSABLE_DOMAIN}`))
    return apiError(403, "TESTE_INDISPONIVEL");
  if (scenarioApplies("teste-pausado", email))
    return apiError(503, "TESTE_PAUSADO");
  if (!nome || nome.length > 120)
    return apiError(422, "VALOR_INVALIDO", { field: "nome" });
  if (!workspace || workspace.length > 80)
    return apiError(422, "VALOR_INVALIDO", { field: "workspace" });
  if (!EMAIL.test(email) || email.length > 254)
    return apiError(422, "VALOR_INVALIDO", { field: "email" });
  if (senha.length < 12 || senha.length > 128 || senha === WEAK_PASSWORD)
    return apiError(422, "SENHA_FRACA", { field: "senha" });
  if (!str(body.aceite_termos_versao))
    return apiError(422, "VALOR_INVALIDO", { field: "aceite_termos_versao" });
  if (store.accounts.has(email)) return apiError(409, "EMAIL_EM_USO");

  const account = createAccount({
    email,
    preset: "nova",
    senha,
    nome,
    workspace,
  });
  account.confirmado = false;
  account.workspace = workspaceFor("nova", workspace);
  store.signups.set(email, (store.signups.get(email) ?? 0) + 1);
  const reply = {
    signup_ticket: issueTicket(email),
    reenviar_em: reenviarEm(),
  };
  if (key) store.idempotency.set(key, { fingerprint, reply });
  return ok(reply, 202);
});

const confirm = http.post("*/v1/auth/confirm", async ({ request }) => {
  const { body, token, refused } = await incoming(request);
  if (refused) return refused;
  const store = panelStore();
  const ticket = store.tickets.get(str(body.signup_ticket));
  if (!ticket) return apiError(400, "CODIGO_EXPIRADO");
  // After 5 wrong codes the code is dead, even the right one (A-X2, spec v1.2 Q3).
  if (ticket.attempts >= MAX_CODE_ATTEMPTS)
    return apiError(400, "CODIGO_EXPIRADO");
  const codigo = str(body.codigo);
  if (codigo === CODES.expired || ticket.expiresAt <= Date.now())
    return apiError(400, "CODIGO_EXPIRADO");
  if (codigo !== ticket.codigo) {
    ticket.attempts += 1;
    return apiError(400, "CODIGO_INCORRETO");
  }
  const account = store.accounts.get(ticket.email);
  if (!account) return apiError(400, "CODIGO_EXPIRADO");
  account.confirmado = true;
  store.tickets.delete(str(body.signup_ticket));
  // Like login (G9, P02.5): the id this browser presented stops working.
  if (token !== undefined) expireSession(token);
  return ok({ sessao: openSession(account.email) });
});

const resend = http.post("*/v1/auth/confirm/resend", async ({ request }) => {
  const { body, refused } = await incoming(request);
  if (refused) return refused;
  const problem = turnstileProblem(body);
  if (problem) return problem;
  const ticket = panelStore().tickets.get(str(body.signup_ticket));
  if (!ticket) return apiError(400, "CODIGO_EXPIRADO");
  if (ticket.email === PANEL_EMAILS.limite)
    return apiError(429, "LIMITE_TENTATIVAS");
  reissueCode(ticket);
  return ok({ reenviar_em: reenviarEm() }, 202);
});

const login = http.post("*/v1/auth/login", async ({ request }) => {
  const { body, token, ip, refused } = await incoming(request);
  if (refused) return refused;
  const email = str(body.email).trim().toLowerCase();
  const senha = str(body.senha);
  if (email === PANEL_EMAILS.limite) return apiError(429, "LIMITE_TENTATIVAS");
  if (senha === NETWORK_DROP_PASSWORD) return networkDrop();
  const hasToken = body.turnstile !== undefined && body.turnstile !== "";
  if (hasToken && body.turnstile !== TURNSTILE_TOKENS.pass)
    return apiError(400, "TURNSTILE_INVALIDO");

  // Failures count per e-mail + client IP, for known and unknown addresses
  // alike (no enumeration; QA G2/G5). No hard lockout: Turnstile after 3.
  const failures = panelStore().loginFailures;
  const key = `${email}|${ip ?? ""}`;
  if ((failures.get(key) ?? 0) >= FAILURES_BEFORE_TURNSTILE && !hasToken)
    return apiError(428, "TURNSTILE_REQUERIDO");
  const account = panelStore().accounts.get(email);
  if (!account || account.senha !== senha) {
    failures.set(key, (failures.get(key) ?? 0) + 1);
    return apiError(401, "CREDENCIAIS_INVALIDAS");
  }
  failures.delete(key);
  if (!account.confirmado) {
    // Only after the password verified; a new code goes out (D-A4).
    return apiError(403, "EMAIL_NAO_CONFIRMADO", {
      signup_ticket: issueTicket(email),
      reenviar_em: reenviarEm(),
    });
  }
  // Rotation (A-X1): a new id on every login, and the id this browser
  // presented, if any, stops working (QA G9).
  if (token !== undefined) expireSession(token);
  return ok({ sessao: openSession(email) });
});

const logout = http.post("*/v1/auth/logout", async ({ request }) => {
  const { token, refused } = await incoming(request);
  if (refused) return refused;
  if (token === undefined) return apiError(401, "SESSAO_EXPIRADA");
  const account = sessionAccount(token);
  // QA G3: the API fails the logout (the panel still deletes its cookie).
  if (account && scenarioApplies("logout-falha", account.email))
    return apiError(500, "ERRO_INTERNO");
  if (account) panelStore().logouts.push(account.email);
  expireSession(token);
  return noContent();
});

const passwordReset = http.post(
  "*/v1/auth/password-reset",
  async ({ request }) => {
    const { body, refused } = await incoming(request);
    if (refused) return refused;
    const problem = turnstileProblem(body);
    if (problem) return problem;
    const email = str(body.email).trim().toLowerCase();
    if (email === PANEL_EMAILS.limite)
      return apiError(429, "LIMITE_TENTATIVAS");
    // 202 whether or not the account exists (no enumeration, AC 6).
    if (panelStore().accounts.has(email)) issueResetToken(email);
    return ok({}, 202);
  },
);

const passwordResetConfirm = http.post(
  "*/v1/auth/password-reset/confirm",
  async ({ request }) => {
    const { body, refused } = await incoming(request);
    if (refused) return refused;
    const senha = str(body.senha);
    if (senha === NETWORK_DROP_PASSWORD) return networkDrop();
    const token = str(body.token);
    const entry = panelStore().resetTokens.get(token);
    if (
      token === EXPIRED_RESET_TOKEN ||
      !entry ||
      entry.used ||
      entry.expiresAt <= Date.now()
    )
      return apiError(400, "TOKEN_INVALIDO");
    if (senha.length < 12 || senha.length > 128 || senha === WEAK_PASSWORD)
      return apiError(422, "SENHA_FRACA", { field: "senha" });
    const account = panelStore().accounts.get(entry.email);
    if (!account) return apiError(400, "TOKEN_INVALIDO");
    entry.used = true;
    account.senha = senha;
    for (const key of panelStore().loginFailures.keys())
      if (key.startsWith(`${account.email}|`))
        panelStore().loginFailures.delete(key);
    // Every session of the account ends (P04).
    revokeSessionsOf(account.email);
    return noContent();
  },
);

// D-A6 (C-M8-7, PH6). A wrong current password is a 403, never a 401: the
// session survives (Security O-F1). 5 failures in 15 min, then 429. Success
// rotates this session (keeping its absolute deadline), revokes every other
// one and the pending reset tokens, and sends mail.password_changed.
const changePassword = http.post("*/v1/auth/password", async ({ request }) => {
  const auth = await homeAuthed(request, "password");
  if ("reply" in auth) return auth.reply;
  const { account } = auth;
  const { body, token } = auth.incoming;
  if (passwordLimited(account.email)) return apiError(429, "LIMITE_TENTATIVAS");
  if (str(body.senha_atual) !== account.senha) {
    recordPasswordFailure(account.email);
    return apiError(403, "SENHA_ATUAL_INCORRETA");
  }
  const senha = str(body.senha_nova);
  if (senha.length < 12 || senha.length > 128 || senha === WEAK_PASSWORD)
    return apiError(422, "SENHA_FRACA", { field: "senha_nova" });
  account.senha = senha;
  clearPasswordFailures(account.email);
  const sessao = rotateSessionsOf(token ?? "", account.email);
  sendNotice(account.email, "mail.password_changed");
  return ok({ sessao });
});

export const panelAuthHandlers: RequestHandler[] = [
  changePassword,
  signup,
  confirm,
  resend,
  login,
  logout,
  passwordResetConfirm,
  passwordReset,
];

// --- Loopback-only controls (M2-06: the mock API binds to 127.0.0.1) ---------

const SCENARIOS: readonly Scenario[] = [
  "categorias-lentas",
  "contagens-falham",
  "workspace-falha",
  "workspace-queda",
  "workspace-invalido",
  "logout-falha",
  "categorias-falham",
  "teste-pausado",
  "me-falha",
  "csv-sem-escape",
  "historico-falha",
  "queda-de-rede-lote",
  "alertas-falha",
  "monitoramento-falha",
];

function isPreset(value: unknown): value is Preset {
  return PRESETS.includes(value as Preset);
}

function queryEmail(request: Request): string {
  return (
    new URL(request.url).searchParams.get("email") ??
    new URL(request.url).searchParams.get("to") ??
    ""
  ).toLowerCase();
}

/** Test controls, served only by the HTTP mock API (pnpm mock:api). */
export const panelControlHandlers: RequestHandler[] = [
  http.post("*/__mock/panel/reset", () => {
    resetPanelMock();
    return new HttpResponse(null, { status: 204 });
  }),
  // The last code and reset link sent to an address (no real e-mail).
  http.get("*/__mock/panel/outbox", ({ request }) => {
    const mail = panelStore().outbox.get(queryEmail(request));
    return mail
      ? HttpResponse.json(mail)
      : new HttpResponse(null, { status: 404 });
  }),
  // PA12: { id } ends one session, { email } all of one account's, {} all.
  http.post("*/__mock/panel/expire-session", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (typeof body.email === "string")
      revokeSessionsOf(body.email.toLowerCase());
    else expireSession(typeof body.id === "string" ? body.id : undefined);
    return new HttpResponse(null, { status: 204 });
  }),
  // PA13, PA19: { scenario, email? } (scoped to one e-mail under parallel E2E).
  http.post("*/__mock/panel/seed", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    // QA G3: Lote's seeds are per account, never global (parallel projects
    // share the store).
    const accountOnly = [
      "lote-poll-falha",
      "csv-sem-escape",
      "historico-falha",
      "queda-de-rede-lote",
      "alertas-falha",
      "monitoramento-falha",
    ];
    if (
      accountOnly.includes(String(body.scenario)) &&
      typeof body.email !== "string"
    )
      return new HttpResponse(null, { status: 400 });
    // PB11: the next n status reads fail (503), then recover.
    if (body.scenario === "lote-poll-falha") {
      seedPollFailures(
        typeof body.n === "number" ? body.n : 1,
        typeof body.email === "string" ? body.email : undefined,
      );
      return new HttpResponse(null, { status: 204 });
    }
    if (!SCENARIOS.includes(body.scenario as Scenario))
      return new HttpResponse(null, { status: 400 });
    seedScenario(
      body.scenario as Scenario,
      typeof body.email === "string" ? body.email : undefined,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  // The scenario off again: { scenario, email? }.
  http.post("*/__mock/panel/unseed", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!SCENARIOS.includes(body.scenario as Scenario))
      return new HttpResponse(null, { status: 400 });
    unseedScenario(
      body.scenario as Scenario,
      typeof body.email === "string" ? body.email : undefined,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  // QA G1: { id, idleMs?, ageMs? } moves one session's clock back.
  http.post("*/__mock/panel/age-session", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const done =
      typeof body.id === "string" &&
      ageSession(
        body.id,
        typeof body.idleMs === "number" ? body.idleMs : 0,
        typeof body.ageMs === "number" ? body.ageMs : 0,
      );
    return new HttpResponse(null, { status: done ? 204 : 404 });
  }),
  // A per-test account from a preset: { email, preset?, senha? }.
  http.post("*/__mock/panel/accounts", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      typeof body.email !== "string" ||
      (body.preset !== undefined && !isPreset(body.preset))
    )
      return new HttpResponse(null, { status: 400 });
    createAccount({
      email: body.email,
      ...(isPreset(body.preset) && { preset: body.preset }),
      ...(typeof body.senha === "string" && { senha: body.senha }),
    });
    return new HttpResponse(null, { status: 201 });
  }),
  // The request log, optionally for one e-mail: proves "no API call" and
  // "no token in a URL".
  http.get("*/__mock/panel/calls", ({ request }) => {
    const email = queryEmail(request);
    const ip = new URL(request.url).searchParams.get("ip");
    const calls = panelStore().calls.filter(
      (call) => (!email || call.email === email) && (!ip || call.ip === ip),
    );
    return HttpResponse.json(calls);
  }),
  // Accounts created per e-mail (AC 2: a double tap makes one).
  http.get("*/__mock/panel/signups", ({ request }) =>
    HttpResponse.json({
      count: panelStore().signups.get(queryEmail(request)) ?? 0,
    }),
  ),
  // Logouts the API recorded for an account (AC 8).
  http.get("*/__mock/panel/logouts", ({ request }) =>
    HttpResponse.json({
      count: panelStore().logouts.filter(
        (email) => email === queryEmail(request),
      ).length,
    }),
  ),
  // An account's workspace and confirmation state, to assert writes.
  http.get("*/__mock/panel/account", ({ request }) => {
    const account = panelStore().accounts.get(queryEmail(request));
    return account
      ? HttpResponse.json({
          confirmado: account.confirmado,
          workspace: account.workspace,
        })
      : new HttpResponse(null, { status: 404 });
  }),
];
