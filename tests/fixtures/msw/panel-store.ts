import {
  CODE_TTL_MS,
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
  /** Logins that failed since the last success (PA17). */
  loginFailures: number;
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
  authorized: boolean;
};

export type Scenario = "categorias-falham" | "teste-pausado";

type Store = {
  accounts: Map<string, Account>;
  sessions: Map<string, { email: string; expiresAt: number }>;
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
    loginFailures: 0,
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
  return {
    accounts,
    sessions: new Map(),
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
  const expiresAt = now + SESSION_TTL_MS;
  store.sessions.set(id, { email, expiresAt });
  return { id, expira_em: new Date(expiresAt).toISOString() };
}

/** The account behind a live session, or undefined. */
export function sessionAccount(id: string | undefined): Account | undefined {
  if (id === undefined) return undefined;
  const session = store.sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) return undefined;
  return store.accounts.get(session.email);
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
