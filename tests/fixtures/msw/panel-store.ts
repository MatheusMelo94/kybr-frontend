import {
  CODE_TTL_MS,
  IDLE_TTL_MS,
  PANEL_EMAILS,
  PANEL_PASSWORD,
  PRESETS,
  RESET_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  randomCode,
  randomToken,
  workspaceFor,
  type Preset,
  type WorkspaceRecord,
} from "../factories/panel.ts";

// The panel mock's in-memory state (contract-request.md § MSW handler
// contract): accounts, sessions, codes, reset tokens, an outbox and a request
// log. One instance per process: Vitest resets it after every test; the HTTP
// mock keeps it for the run, so E2E tests use their own (unique) e-mails.

export type Account = {
  email: string;
  nome: string;
  senha: string;
  confirmado: boolean;
  workspace: WorkspaceRecord;
};

export type Ticket = {
  email: string;
  codigo: string;
  expiresAt: number;
  attempts: number;
};

export type CallRecord = {
  method: string;
  /** Path and query only: proves no token travels in a URL. */
  path: string;
  email?: string;
  turnstile?: string;
  /** X-Kybr-Client-IP: lets parallel E2E filter their own calls (QA G2). */
  ip?: string;
  /** The JSON body's keys, sorted (never the values). */
  bodyKeys?: string[];
  authorized: boolean;
};

type Session = { email: string; createdAt: number; lastActivity: number };

export type Scenario =
  | "categorias-falham"
  | "categorias-lentas"
  | "teste-pausado"
  | "me-falha"
  | "contagens-falham"
  | "workspace-falha"
  | "workspace-queda"
  | "workspace-invalido"
  | "logout-falha";

type Store = {
  accounts: Map<string, Account>;
  sessions: Map<string, Session>;
  /** Failed logins per "e-mail|client IP" since the last success (PA17, QA G2/G5). */
  loginFailures: Map<string, number>;
  tickets: Map<string, Ticket>;
  resetTokens: Map<string, { email: string; expiresAt: number; used: boolean }>;
  outbox: Map<string, { codigo?: string; link?: string }>;
  /** A-X7: the first sign-up answer per Idempotency-Key, with its body. */
  idempotency: Map<
    string,
    {
      fingerprint: string;
      reply: { signup_ticket: string; reenviar_em: string };
    }
  >;
  /** Accounts created per e-mail (a double tap must make one, AC 2). */
  signups: Map<string, number>;
  logouts: string[];
  calls: CallRecord[];
  /** Scenario → the e-mails it applies to, or "all". */
  scenarios: Map<Scenario, Set<string> | "all">;
};

const SEEDED: Record<
  Preset,
  { email: string; nome: string; workspace: string }
> = {
  renata: {
    email: PANEL_EMAILS.renata,
    nome: "Renata Exemplo",
    workspace: "Loja Exemplo",
  },
  nova: {
    email: PANEL_EMAILS.nova,
    nome: "Nova Exemplo",
    workspace: "Plataforma Nova",
  },
  pendente: {
    email: PANEL_EMAILS.pendente,
    nome: "Pendente Exemplo",
    workspace: "Plataforma Pendente",
  },
  parcial: {
    email: PANEL_EMAILS.parcial,
    nome: "Parcial Exemplo",
    workspace: "Plataforma Parcial",
  },
  esgotado: {
    email: PANEL_EMAILS.esgotado,
    nome: "Esgotado Exemplo",
    workspace: "Plataforma Esgotada",
  },
  pago: {
    email: PANEL_EMAILS.pago,
    nome: "Pago Exemplo",
    workspace: "Plataforma Paga",
  },
  // QA G3: count edge cases (also reachable per test through /accounts).
  "tres-abertos": {
    email: "tres-abertos@exemplo.test",
    nome: "Tres Exemplo",
    workspace: "Plataforma Tres",
  },
  "um-aberto": {
    email: "um-aberto@exemplo.test",
    nome: "Um Exemplo",
    workspace: "Plataforma Um",
  },
  zerado: {
    email: "zerado@exemplo.test",
    nome: "Zerado Exemplo",
    workspace: "Plataforma Zerada",
  },
  semverificacoes: {
    email: "semverificacoes@exemplo.test",
    nome: "Sem Exemplo",
    workspace: "Plataforma Sem Verificações",
  },
  "um-vendedor": {
    email: "um-vendedor@exemplo.test",
    nome: "Vendedor Exemplo",
    workspace: "Plataforma Pequena",
  },
};

function accountFor(
  preset: Preset,
  email: string,
  nome: string,
  workspace: string,
): Account {
  return {
    email,
    nome,
    senha: PANEL_PASSWORD,
    confirmado: preset !== "pendente",
    workspace: workspaceFor(preset, workspace),
  };
}

function createStore(): Store {
  const accounts = new Map<string, Account>();
  for (const preset of PRESETS) {
    const { email, nome, workspace } = SEEDED[preset];
    accounts.set(email, accountFor(preset, email, nome, workspace));
  }
  // PA2: an existing account for the 409.
  accounts.set(
    PANEL_EMAILS.existente,
    accountFor(
      "renata",
      PANEL_EMAILS.existente,
      "Existente Exemplo",
      "Plataforma Existente",
    ),
  );
  // QA G6: a second workspace (its case is FOREIGN_CASE_ID, from M6).
  accounts.set(
    PANEL_EMAILS.outro,
    accountFor(
      "renata",
      PANEL_EMAILS.outro,
      "Outro Exemplo",
      "Outra Plataforma",
    ),
  );
  return {
    accounts,
    sessions: new Map(),
    loginFailures: new Map(),
    tickets: new Map(),
    resetTokens: new Map(),
    outbox: new Map(),
    idempotency: new Map(),
    signups: new Map(),
    logouts: [],
    calls: [],
    scenarios: new Map(),
  };
}

let store = createStore();

/** Back to the seeded accounts, with no sessions, codes, mail or log. */
export function resetPanelMock(): void {
  store = createStore();
}

export function panelStore(): Store {
  return store;
}

/** A per-test account cloned from a preset (E2E runs in parallel). */
export function createAccount(input: {
  email: string;
  preset?: Preset;
  senha?: string;
  nome?: string;
  workspace?: string;
}): Account {
  const preset = input.preset ?? "renata";
  const account = accountFor(
    preset,
    input.email.toLowerCase(),
    input.nome ?? SEEDED[preset].nome,
    input.workspace ?? SEEDED[preset].workspace,
  );
  if (input.senha !== undefined) account.senha = input.senha;
  store.accounts.set(account.email, account);
  return account;
}

export function openSession(
  email: string,
  now = Date.now(),
): { id: string; expira_em: string } {
  const id = randomToken(24);
  store.sessions.set(id, { email, createdAt: now, lastActivity: now });
  return { id, expira_em: new Date(now + SESSION_TTL_MS).toISOString() };
}

/**
 * The account behind a live session (12 h sliding idle, 7 d absolute; U-P6),
 * or undefined. A request slides the idle clock unless `touch` is false (a
 * poll: the user's Q decision, polls don't keep a session alive).
 */
export function sessionAccount(
  id: string | undefined,
  touch = true,
): Account | undefined {
  if (id === undefined) return undefined;
  const session = store.sessions.get(id);
  const now = Date.now();
  if (!session) return undefined;
  if (
    now - session.createdAt >= SESSION_TTL_MS ||
    now - session.lastActivity >= IDLE_TTL_MS
  ) {
    store.sessions.delete(id);
    return undefined;
  }
  if (touch) session.lastActivity = now;
  return store.accounts.get(session.email);
}

/** QA G1: moves a session's last activity and/or creation back in time. */
export function ageSession(id: string, idleMs = 0, ageMs = 0): boolean {
  const session = store.sessions.get(id);
  if (!session) return false;
  session.lastActivity -= idleMs;
  session.createdAt -= ageMs;
  return true;
}

/** PA12: ends one session, or every session when no id is given. */
export function expireSession(id?: string): void {
  if (id === undefined) store.sessions.clear();
  else store.sessions.delete(id);
}

export function revokeSessionsOf(email: string): void {
  for (const [id, session] of store.sessions)
    if (session.email === email) store.sessions.delete(id);
}

/** A ticket-bound code (CR-P3), mailed to the outbox. */
export function issueTicket(email: string): string {
  const ticket = randomToken(24);
  const codigo = randomCode();
  store.tickets.set(ticket, {
    email,
    codigo,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  });
  store.outbox.set(email, { ...store.outbox.get(email), codigo });
  return ticket;
}

/** A new code on an existing ticket (D-A3). */
export function reissueCode(ticket: Ticket): void {
  ticket.codigo = randomCode();
  ticket.expiresAt = Date.now() + CODE_TTL_MS;
  ticket.attempts = 0;
  store.outbox.set(ticket.email, {
    ...store.outbox.get(ticket.email),
    codigo: ticket.codigo,
  });
}

/** A single-use reset token (P04), mailed as a fragment link. */
export function issueResetToken(email: string): string {
  // A newer token invalidates the older ones.
  for (const [token, entry] of store.resetTokens)
    if (entry.email === email) store.resetTokens.delete(token);
  const token = randomToken(32);
  store.resetTokens.set(token, {
    email,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    used: false,
  });
  store.outbox.set(email, {
    ...store.outbox.get(email),
    link: `/senha/nova#t=${token}`,
  });
  return token;
}

export function scenarioApplies(
  scenario: Scenario,
  email: string | undefined,
): boolean {
  const scope = store.scenarios.get(scenario);
  if (scope === undefined) return false;
  return scope === "all" || (email !== undefined && scope.has(email));
}

/** Turns a scenario off again (for one e-mail, or everyone). */
export function unseedScenario(scenario: Scenario, email?: string): void {
  const scope = store.scenarios.get(scenario);
  if (email === undefined || scope === "all") {
    store.scenarios.delete(scenario);
    return;
  }
  scope?.delete(email.toLowerCase());
}

/** Turns a scenario on, for everyone or for one e-mail (parallel E2E). */
export function seedScenario(scenario: Scenario, email?: string): void {
  if (email === undefined) {
    store.scenarios.set(scenario, "all");
    return;
  }
  const scope = store.scenarios.get(scenario);
  if (scope === "all") return;
  store.scenarios.set(
    scenario,
    new Set([...(scope ?? []), email.toLowerCase()]),
  );
}

export function recordCall(call: CallRecord): void {
  store.calls.push(call);
}
