import {
  ALERT_EMAILS,
  ALERT_PRESETS,
  alertsForPreset,
  type AlertPreset,
  type AlertRecord,
  type MonitoringRecord,
  CASE_PRESETS,
  casesForPreset,
  foreignCase,
  type CasePreset,
  type CaseRecord,
  BATCH_DURATION_MS,
  BATCH_SETS,
  FOREIGN_BATCH_ID,
  CODE_TTL_MS,
  HOME_EMAILS,
  HOME_NAMES,
  dashboardFor,
  slugFor,
  type DashboardRecord,
  type HomePreset,
  IDLE_TTL_MS,
  PANEL_EMAILS,
  PANEL_PASSWORD,
  PRESETS,
  RESET_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  randomCode,
  randomToken,
  workspaceFor,
  type BatchLinha,
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
  /** D-B1: the row count and the Idempotency-Key, never the rows (T69). */
  rows?: number;
  idempotencyKey?: string;
  /** QA G1: the keys seen across linhas, and how many rows carry each optional field. */
  rowKeys?: string[];
  withResponsavel?: number;
  withExtId?: number;
  /** QA G6: the request carried X-Kybr-Poll: 1. */
  poll?: boolean;
  /** M6 (QA G5): a decide's type and reason, a request's types (never the note or a link). */
  decisao?: string;
  motivoCodigo?: string;
  tipos?: string[];
  /** F7: the page the Server Action was posted from (x-kybr-panel-path). */
  pagePath?: string;
};

/** QA G2 / G9 / G11: the case endpoints a per-account fault can target. */
export type CaseEndpoint =
  | "list"
  | "poll"
  | "case"
  | "eventos"
  | "documentos"
  | "decide"
  | "request-documents"
  | "certificate"
  | "documento"
  | "doc-url"
  /** G11 lista-atrasada: armed for the next decision. */
  | "lag";
/** Every fault kind the case-fault control accepts (anything else → 400). */
export const CASE_FAULT_KINDS = [
  "delay",
  "500",
  "503",
  "drop",
  /** F5: applied, then the socket is destroyed (the outcome is unknown). */
  "drop-after",
  /** eventos / documentos left out of the case (partial). */
  "omit",
  /** G11: a case that breaks the schema. */
  "invalido",
  "link-estranho",
  "link-invalido",
  "lista-atrasada",
  /** The certificate / a document: HTML, over 5 MB, or cut short. */
  "html",
  "grande",
  "truncado",
  /** DR-15: a valid PDF of exactly `bytes` bytes (the 4 MiB attachment boundary). */
  "tamanho",
  /** G9 / PC20: a signed URL the documents allowlist must refuse. */
  "host-estranho",
  "userinfo",
  "host-parecido",
  "porta",
  "http-externo",
] as const;
export type CaseFault = {
  kind: (typeof CASE_FAULT_KINDS)[number];
  ms?: number;
  /** How many requests it applies to (unlimited when missing). */
  times?: number;
  /** lista-atrasada: how many list reads still show the decided case. */
  reads?: number;
  /** tamanho: the document's exact size. */
  bytes?: number;
};

/** QA G4: a per-account fault on one batch endpoint. */
export type BatchEndpoint =
  | "start"
  | "status"
  | "rows"
  | "to-queue"
  | "monitor"
  | "resume"
  | "result.csv"
  | "errors.csv"
  | "history"
  | "me";
export type BatchFault = {
  kind:
    | "delay"
    | "500"
    | "drop"
    | "csv-grande"
    | "csv-html"
    | "csv-aspas"
    | "csv-virgula"
    | "csv-irregular"
    | "processados-acima";
  ms?: number;
  /** How many requests it applies to (unlimited when missing). */
  times?: number;
};

/** A batch in the mock (D-B1–D-B7). */
export type BatchRecord = {
  id: string;
  /** The owner's e-mail: another account's read is a 404 (A-X3, PB10). */
  email: string;
  linhas: BatchLinha[];
  estado: "processando" | "concluido" | "concluido_com_erros" | "falhou";
  processados: number;
  /** PB4: a body with the FALHA CNPJ stops here (ceil(total / 2)) until resumed. */
  failAt: number | undefined;
  /** PB1: a held batch doesn't advance on status reads. */
  held: boolean;
  startedAt: number;
  /** QA G11: concluido_em = startedAt + durationMs (41 s by default). */
  durationMs: number;
  finishedAt: number | undefined;
  monitorado: boolean;
  enviado_para_fila: boolean;
  criados: number | undefined;
  monitorados: number | undefined;
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
  | "logout-falha"
  // M5 batches (PB8, PB9, PB12; PB11 counts in pollFailures)
  | "csv-sem-escape"
  | "historico-falha"
  | "queda-de-rede-lote"
  // M7 (PM7): per account only (QA G2)
  | "alertas-falha"
  | "monitoramento-falha";

/** QA G2: the alert endpoints a per-account fault can target. */
export type AlertEndpoint = "alerts" | "monitoring";
export const ALERT_FAULT_KINDS = ["delay", "500", "503", "drop"] as const;
export type AlertFault = {
  kind: (typeof ALERT_FAULT_KINDS)[number];
  ms?: number;
  /** How many requests it applies to (unlimited when missing). */
  times?: number;
};

type Store = {
  accounts: Map<string, Account>;
  sessions: Map<string, Session>;
  /** Failed logins per "e-mail|client IP" since the last success (PA17, QA G2/G5). */
  loginFailures: Map<string, number>;
  tickets: Map<string, Ticket>;
  resetTokens: Map<string, { email: string; expiresAt: number; used: boolean }>;
  outbox: Map<
    string,
    {
      codigo?: string;
      link?: string;
      /** D-M3: the last mail.alert.* (subject and CTA link). */
      alerta?: { assunto: string; link: string };
      /** M8: the notices sent (mail.password_changed), never their content. */
      avisos?: string[];
    }
  >;
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
  batches: Map<string, BatchRecord>;
  /** A-X7 per workspace: "e-mail|key" → the first reply and its body. */
  batchKeys: Map<string, { fingerprint: string; reply: unknown }>;
  /** PB11: status reads still to fail, per e-mail ("*" = everyone). */
  pollFailures: Map<string, number>;
  /** QA G4: "e-mail|endpoint" → its fault. */
  faults: Map<string, BatchFault>;
  /** Scenario → the e-mails it applies to, or "all". */
  scenarios: Map<Scenario, Set<string> | "all">;
  /** M6: every case, by id (owner in the record). */
  cases: Map<string, CaseRecord>;
  /** A-X7 for D-C3/D-C4: "e-mail|key" → the first reply and its body. */
  caseKeys: Map<
    string,
    { fingerprint: string; status: number; reply: unknown }
  >;
  /** QA G2: "e-mail|endpoint" → its fault. */
  caseFaults: Map<string, CaseFault>;
  /** QA G4: an account's fixed "now" (ms). */
  caseClocks: Map<string, number>;
  /** D-C6: a signed URL's sig → what it opens (a new sig per read, QA G9). */
  docSigs: Map<string, { email: string; caseId: string; docId: string }>;
  /** QA G11 lista-atrasada: the decided case the list still shows, n more reads. */
  lagging: Map<string, { snapshot: CaseRecord; reads: number }>;
  /** M7: alerts by id, and each account's D-M2 status (set → the count is derived). */
  alerts: Map<string, AlertRecord>;
  monitoring: Map<string, MonitoringRecord>;
  alertFaults: Map<string, AlertFault>;
  /** M8a: each account's dashboard parts (fila/alertas come from the store). */
  dashboards: Map<string, DashboardRecord>;
  /** QA G2 (M8): "e-mail|endpoint" → its fault. */
  homeFaults: Map<string, HomeFault>;
  /** C-M8-7: failed password changes per e-mail (timestamps, 15 min window). */
  passwordFailures: Map<string, number[]>;
  /** QA G7: revoked sessions (id → owner and creation), for the sessions read. */
  revokedSessions: Map<string, { email: string; createdAt: number }>;
};

/** QA G2 (M8a): the endpoints a per-account Início/settings fault can target. */
export type HomeEndpoint =
  "dashboard" | "first-steps" | "workspace-put" | "me-put" | "password";
export const HOME_FAULT_KINDS = [
  "delay",
  "500",
  "503",
  "drop",
  "omit",
] as const;
export type HomeFault = {
  kind: (typeof HOME_FAULT_KINDS)[number];
  ms?: number;
  /** How many requests it applies to (unlimited when missing). */
  times?: number;
  /** "omit" only: the D-H1 fields left out (PH3). */
  sem?: string[];
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
  cem: {
    email: "cem@exemplo.test",
    nome: "Cem Exemplo",
    workspace: "Plataforma Cem",
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

/** QA G8: pago@'s finished batch, there from boot (PB10's foreign id). */
function foreignBatch(): BatchRecord {
  const startedAt = Date.parse("2026-10-01T13:00:00Z");
  return {
    id: FOREIGN_BATCH_ID,
    email: PANEL_EMAILS.pago,
    linhas: BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
    estado: "concluido",
    processados: BATCH_SETS.tudoOk.length,
    failAt: undefined,
    held: false,
    startedAt,
    durationMs: BATCH_DURATION_MS,
    finishedAt: startedAt + BATCH_DURATION_MS,
    monitorado: false,
    enviado_para_fila: false,
    criados: undefined,
    monitorados: undefined,
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
  // M6 (PC1, PC3, PC4): the Fila's accounts. Their Fila counts come from the
  // case store alone (QA G3).
  for (const [email, nome, webhook] of [
    [PANEL_EMAILS.fila, "Fila Exemplo", true],
    [PANEL_EMAILS.filavazia, "Fila Vazia Exemplo", true],
    [PANEL_EMAILS.semwebhook, "Sem Webhook Exemplo", false],
  ] as const) {
    const account = accountFor("renata", email, nome, `Plataforma ${nome}`);
    account.workspace.webhook_configurado = webhook;
    zeroFilaCounts(account);
    accounts.set(email, account);
  }
  const now = Date.now();
  const cases = new Map<string, CaseRecord>();
  // M7 (PM1, PM3–PM5): the Monitoramento's accounts, from the renata preset.
  const alerts = new Map<string, AlertRecord>();
  const monitoring = new Map<string, MonitoringRecord>();
  for (const [email, preset] of [
    [ALERT_EMAILS.alertas, "pm1"],
    [ALERT_EMAILS.semmonitor, "vazio"],
    [ALERT_EMAILS.semvarredura, "semvarredura"],
    [ALERT_EMAILS.semalertas, "semalertas"],
  ] as const) {
    const account = accountFor(
      "renata",
      email,
      "Alerta Exemplo",
      "Plataforma Monitorada",
    );
    zeroFilaCounts(account);
    accounts.set(email, account);
    const seeded = alertsForPreset(preset, email, now);
    for (const alert of seeded.alerts) alerts.set(alert.id, alert);
    for (const record of seeded.cases) cases.set(record.id, record);
    monitoring.set(email, seeded.monitoring);
  }
  // M8a (PH2): a new, onboarded workspace with nothing verified (read-only).
  const nada = accountFor(
    "zerado",
    HOME_EMAILS.nada,
    "Nada Exemplo",
    "Plataforma Nada",
  );
  nada.workspace.plano = { tipo: "teste", usadas: 0, limite: 200 };
  accounts.set(HOME_EMAILS.nada, nada);
  for (const record of [
    ...casesForPreset("pc1", PANEL_EMAILS.fila, now),
    ...casesForPreset("um", PANEL_EMAILS.semwebhook, now),
    foreignCase(now),
  ])
    cases.set(record.id, record);
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
    batches: new Map([[FOREIGN_BATCH_ID, foreignBatch()]]),
    batchKeys: new Map(),
    pollFailures: new Map(),
    faults: new Map(),
    scenarios: new Map(),
    cases,
    caseKeys: new Map(),
    caseFaults: new Map(),
    caseClocks: new Map(),
    docSigs: new Map(),
    lagging: new Map(),
    alerts,
    monitoring,
    alertFaults: new Map(),
    dashboards: new Map([[HOME_EMAILS.nada, dashboardFor("novo")]]),
    homeFaults: new Map(),
    passwordFailures: new Map(),
    revokedSessions: new Map(),
  };
}

/** The account's static Fila counts become 0: the case store is the only source. */
function zeroFilaCounts(account: Account): void {
  const contagens = account.workspace.contagens;
  if (!contagens) return;
  // A copy: presets share their counts object.
  account.workspace.contagens = {
    ...contagens,
    fila_abertos: 0,
    fila_vencidos: 0,
    fila_aguardando: 0,
  };
}

let store = createStore();

/** Back to the seeded accounts, with no sessions, codes, mail or log. */
export function resetPanelMock(): void {
  store = createStore();
  resetBatchClock();
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
    if (session.email === email) {
      store.sessions.delete(id);
      store.revokedSessions.set(id, { email, createdAt: session.createdAt });
    }
}

/**
 * C-M8-7: revokes every session of the account (this one included) and opens
 * a new one that keeps this session's absolute deadline (O-F3).
 */
export function rotateSessionsOf(
  currentId: string,
  email: string,
): { id: string; expira_em: string } {
  const createdAt = store.sessions.get(currentId)?.createdAt ?? Date.now();
  revokeSessionsOf(email);
  for (const [token, record] of store.resetTokens)
    if (record.email === email) store.resetTokens.delete(token);
  const id = randomToken(24);
  store.sessions.set(id, { email, createdAt, lastActivity: Date.now() });
  return { id, expira_em: new Date(createdAt + SESSION_TTL_MS).toISOString() };
}

/** QA G7: an account's sessions, live and revoked, by digest only. */
export function sessionsOf(
  email: string,
): { id: string; createdAt: number; revogada: boolean }[] {
  return [
    ...[...store.sessions]
      .filter(([, session]) => session.email === email)
      .map(([id, session]) => ({
        id,
        createdAt: session.createdAt,
        revogada: false,
      })),
    ...[...store.revokedSessions]
      .filter(([, session]) => session.email === email)
      .map(([id, session]) => ({
        id,
        createdAt: session.createdAt,
        revogada: true,
      })),
  ];
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

// --- Batches (M5) -------------------------------------------------------------

let batchClock: () => number = () => Date.now();

/** PB1: the time iniciado_em comes from (concluido_em = it + BATCH_DURATION_MS), so {duracao} is stable. Vitest resets it. */
export function setBatchClock(clock: () => number): void {
  batchClock = clock;
}

export function resetBatchClock(): void {
  batchClock = () => Date.now();
}

export function newBatch(email: string, linhas: BatchLinha[]): BatchRecord {
  const total = linhas.length;
  const batch: BatchRecord = {
    id: crypto.randomUUID(),
    email,
    linhas,
    estado: "processando",
    processados: 0,
    failAt: linhas.some((linha) => linha.cnpj === BATCH_SETS.falha)
      ? Math.ceil(total / 2)
      : undefined,
    held: false,
    // Whole seconds, like the API's timestamps.
    startedAt: Math.floor(batchClock() / 1000) * 1000,
    durationMs: BATCH_DURATION_MS,
    finishedAt: undefined,
    monitorado: false,
    enviado_para_fila: false,
    criados: undefined,
    monitorados: undefined,
  };
  store.batches.set(batch.id, batch);
  return batch;
}

/** The batch if it exists AND belongs to `email`: otherwise undefined (the same 404). */
export function ownBatch(id: string, email: string): BatchRecord | undefined {
  const batch = store.batches.get(id);
  return batch?.email === email ? batch : undefined;
}

export function batchesOf(email: string): BatchRecord[] {
  return [...store.batches.values()]
    .filter((batch) => batch.email === email)
    .reverse()
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** PB17: contagens.lote_em_andamento. */
export function hasRunningBatch(email: string): boolean {
  return batchesOf(email).some((batch) => batch.estado === "processando");
}

export function finishBatchAt(batch: BatchRecord): number {
  return batch.startedAt + batch.durationMs;
}

/** QA G4: sets (or, with kind "none", clears) a per-account fault. */
export function setFault(
  email: string,
  endpoint: BatchEndpoint,
  fault: BatchFault | undefined,
): void {
  const key = `${email.toLowerCase()}|${endpoint}`;
  if (fault === undefined) store.faults.delete(key);
  else store.faults.set(key, fault);
}

/** The fault for this request, if any (one fewer left when it's counted). */
export function takeFault(
  email: string,
  endpoint: BatchEndpoint,
): BatchFault | undefined {
  const key = `${email}|${endpoint}`;
  const fault = store.faults.get(key);
  if (fault === undefined) return undefined;
  if (fault.times !== undefined) {
    if (fault.times <= 1) store.faults.delete(key);
    else store.faults.set(key, { ...fault, times: fault.times - 1 });
  }
  return fault;
}

/** QA G6: a session's clocks, for proving that a poll doesn't slide idle. */
export function sessionClock(
  id: string,
): { createdAt: number; lastActivity: number } | undefined {
  const session = store.sessions.get(id);
  return (
    session && {
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    }
  );
}

/** PB11: true (and one fewer left) when this status read must fail. */
export function takePollFailure(email: string): boolean {
  for (const key of [email, "*"]) {
    const left = store.pollFailures.get(key) ?? 0;
    if (left > 0) {
      store.pollFailures.set(key, left - 1);
      return true;
    }
  }
  return false;
}

export function seedPollFailures(n: number, email?: string): void {
  store.pollFailures.set(email?.toLowerCase() ?? "*", n);
}

// --- Cases (M6) ---------------------------------------------------------------

/** QA G4: the account's "now" (fixed by /__mock/panel/case-clock), in ms. */
export function caseNow(email: string): number {
  return store.caseClocks.get(email) ?? Date.now();
}

export function setCaseClock(email: string, now: number | undefined): void {
  if (now === undefined) store.caseClocks.delete(email);
  else store.caseClocks.set(email, now);
}

export function casesOf(email: string): CaseRecord[] {
  return [...store.cases.values()].filter((record) => record.email === email);
}

/** The case if it exists AND belongs to `email`: otherwise undefined (the same 404). */
export function ownCase(id: string, email: string): CaseRecord | undefined {
  const record = store.cases.get(id);
  return record?.email === email ? record : undefined;
}

export function addCase(record: CaseRecord): void {
  store.cases.set(record.id, record);
}

export function isCasePreset(value: unknown): value is CasePreset {
  return (CASE_PRESETS as readonly unknown[]).includes(value);
}

/**
 * QA G1: replaces an account's cases with a preset (creating the account
 * from the renata preset if needed); its Fila counts then come from the
 * store alone.
 */
export function seedCases(email: string, preset: CasePreset): CaseRecord[] {
  const normalized = email.toLowerCase();
  const account =
    store.accounts.get(normalized) ?? createAccount({ email: normalized });
  zeroFilaCounts(account);
  for (const record of casesOf(normalized)) store.cases.delete(record.id);
  const records = casesForPreset(preset, normalized, caseNow(normalized));
  for (const record of records) store.cases.set(record.id, record);
  return records;
}

/** QA G3: the Fila counts of the account's cases (added to its static ones). */
export function caseCounts(email: string): {
  abertos: number;
  vencidos: number;
  aguardando: number;
} {
  const now = caseNow(email);
  const own = casesOf(email);
  const abertos = own.filter((record) => record.estado === "aberto");
  return {
    abertos: abertos.length,
    vencidos: abertos.filter((record) => record.sla_ate < now).length,
    aguardando: own.filter((record) => record.estado === "aguardando_doc")
      .length,
  };
}

/** QA G2: sets (or, with undefined, clears) a per-account case fault. */
export function setCaseFault(
  email: string,
  endpoint: CaseEndpoint,
  fault: CaseFault | undefined,
): void {
  const key = `${email.toLowerCase()}|${endpoint}`;
  if (fault === undefined) store.caseFaults.delete(key);
  else store.caseFaults.set(key, fault);
}

/** The fault for this request, if any (one fewer left when it's counted). */
export function takeCaseFault(
  email: string,
  endpoint: CaseEndpoint,
): CaseFault | undefined {
  const key = `${email}|${endpoint}`;
  const fault = store.caseFaults.get(key);
  if (fault === undefined) return undefined;
  if (fault.times !== undefined) {
    if (fault.times <= 1) store.caseFaults.delete(key);
    else store.caseFaults.set(key, { ...fault, times: fault.times - 1 });
  }
  return fault;
}

/** D-C6: a fresh sig for one document read (never logged). */
export function mintDocSig(
  email: string,
  caseId: string,
  docId: string,
): string {
  const sig = randomToken(16);
  store.docSigs.set(sig, { email, caseId, docId });
  return sig;
}

export function docForSig(
  sig: string,
): { email: string; caseId: string; docId: string } | undefined {
  return store.docSigs.get(sig);
}

// --- Alerts (M7) --------------------------------------------------------------

export function isAlertPreset(value: unknown): value is AlertPreset {
  return (ALERT_PRESETS as readonly unknown[]).includes(value);
}

/**
 * QA G1: replaces an account's alerts, their cases and its D-M2 status with a
 * preset (creating the account from the renata preset if needed), at the
 * account's clock (QA G3). Its Fila and alert counts then come from the store.
 */
export function seedAlerts(email: string, preset: AlertPreset): void {
  const normalized = email.toLowerCase();
  const account =
    store.accounts.get(normalized) ?? createAccount({ email: normalized });
  zeroFilaCounts(account);
  for (const alert of alertsOf(normalized)) {
    store.alerts.delete(alert.id);
    if (alert.case_id !== undefined) store.cases.delete(alert.case_id);
  }
  const seeded = alertsForPreset(preset, normalized, caseNow(normalized));
  for (const alert of seeded.alerts) store.alerts.set(alert.id, alert);
  for (const record of seeded.cases) store.cases.set(record.id, record);
  store.monitoring.set(normalized, seeded.monitoring);
}

/** The account's alerts, newest first, ties by id (C-M7-5). */
export function alertsOf(email: string): AlertRecord[] {
  return [...store.alerts.values()]
    .filter((alert) => alert.email === email)
    .sort(
      (a, b) =>
        b.detectado_em - a.detectado_em ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

export function addAlert(alert: AlertRecord): void {
  store.alerts.set(alert.id, alert);
}

/** The D-M2 status, or undefined for an account M7 never seeded. */
export function monitoringOf(email: string): MonitoringRecord | undefined {
  return store.monitoring.get(email);
}

export function setMonitoring(email: string, record: MonitoringRecord): void {
  store.monitoring.set(email, record);
}

/**
 * C-M7-4 / QA G7: critical alerts whose case is undecided, or undefined for
 * an account M7 never seeded (its static count stands).
 */
export function alertCount(email: string): number | undefined {
  if (!store.monitoring.has(email)) return undefined;
  return alertsOf(email).filter(
    (alert) =>
      alert.severidade === "critico" &&
      alert.case_id !== undefined &&
      store.cases.get(alert.case_id)?.estado !== "decidido",
  ).length;
}

/** QA G2: sets (or, with undefined, clears) a per-account alert fault. */
export function setAlertFault(
  email: string,
  endpoint: AlertEndpoint,
  fault: AlertFault | undefined,
): void {
  const key = `${email.toLowerCase()}|${endpoint}`;
  if (fault === undefined) store.alertFaults.delete(key);
  else store.alertFaults.set(key, fault);
}

/** The fault for this request, if any (one fewer left when it's counted). */
export function takeAlertFault(
  email: string,
  endpoint: AlertEndpoint,
): AlertFault | undefined {
  const key = `${email}|${endpoint}`;
  const fault = store.alertFaults.get(key);
  if (fault === undefined) return undefined;
  if (fault.times !== undefined) {
    if (fault.times <= 1) store.alertFaults.delete(key);
    else store.alertFaults.set(key, { ...fault, times: fault.times - 1 });
  }
  return fault;
}

// --- Início and settings (M8a) -------------------------------------------------

export function dashboardOf(email: string): DashboardRecord {
  let record = store.dashboards.get(email);
  if (!record) {
    record = dashboardFor("padrao");
    store.dashboards.set(email, record);
  }
  return record;
}

/**
 * QA G1: a dashboard preset in the test's own account (created if needed).
 * populado seeds the PC1 cases and the PM1 alerts, with QA G4's names on
 * the cards; novo empties the account (PH2).
 */
export function seedDashboard(email: string, preset: HomePreset): void {
  const normalized = email.toLowerCase();
  const account =
    store.accounts.get(normalized) ?? createAccount({ email: normalized });
  if (preset === "novo") {
    seedCases(normalized, "vazia");
    seedAlerts(normalized, "vazio");
    const contagens = account.workspace.contagens;
    if (contagens)
      account.workspace.contagens = {
        ...contagens,
        alertas_criticos_abertos: 0,
        vendedores: 0,
      };
    if (account.workspace.plano)
      account.workspace.plano = { ...account.workspace.plano, usadas: 0 };
  } else {
    seedCases(normalized, "pc1");
    seedAlerts(normalized, "pm1");
    const oldest = casesOf(normalized)
      .filter((record) => record.estado === "aberto")
      .sort((a, b) => a.criado_em - b.criado_em);
    const named = [HOME_NAMES.meiFormatted, HOME_NAMES.hostile];
    oldest.slice(0, 2).forEach((record, i) => {
      record.razao_social = named[i] ?? null;
      record.seller = { ...record.seller, razao_social: named[i] ?? null };
    });
    const newest = alertsOf(normalized)[0];
    if (newest)
      newest.seller = { ...newest.seller, razao_social: HOME_NAMES.meiBare };
  }
  // C-M8-9: its own slug, so D1 shows this workspace's settings alone.
  account.workspace.slug = slugFor(
    account.workspace.nome,
    crypto.randomUUID().slice(0, 8),
  );
  store.dashboards.set(normalized, dashboardFor(preset));
}

/** QA G2: sets (or, with undefined, clears) a per-account M8a fault. */
export function setHomeFault(
  email: string,
  endpoint: HomeEndpoint,
  fault: HomeFault | undefined,
): void {
  const key = `${email.toLowerCase()}|${endpoint}`;
  if (fault === undefined) store.homeFaults.delete(key);
  else store.homeFaults.set(key, fault);
}

/** The fault for this request, if any (one fewer left when it's counted). */
export function takeHomeFault(
  email: string,
  endpoint: HomeEndpoint,
): HomeFault | undefined {
  const key = `${email}|${endpoint}`;
  const fault = store.homeFaults.get(key);
  if (fault === undefined) return undefined;
  if (fault.times !== undefined) {
    if (fault.times <= 1) store.homeFaults.delete(key);
    else store.homeFaults.set(key, { ...fault, times: fault.times - 1 });
  }
  return fault;
}

const PASSWORD_WINDOW_MS = 15 * 60_000;
const PASSWORD_FAILURES_ALLOWED = 5;

/** C-M8-7: true once the account failed 5 times in the last 15 minutes. */
export function passwordLimited(email: string, now = Date.now()): boolean {
  const recent = (store.passwordFailures.get(email) ?? []).filter(
    (at) => now - at < PASSWORD_WINDOW_MS,
  );
  store.passwordFailures.set(email, recent);
  return recent.length >= PASSWORD_FAILURES_ALLOWED;
}

export function recordPasswordFailure(email: string, now = Date.now()): void {
  store.passwordFailures.set(email, [
    ...(store.passwordFailures.get(email) ?? []),
    now,
  ]);
}

export function clearPasswordFailures(email: string): void {
  store.passwordFailures.delete(email);
}

/** M8: a notice in the outbox (its key, never its content). */
export function sendNotice(email: string, aviso: string): void {
  const mail = store.outbox.get(email) ?? {};
  store.outbox.set(email, { ...mail, avisos: [...(mail.avisos ?? []), aviso] });
}

/** C-M8-9: the onboarded workspace behind a public slug, for D1. */
export function workspaceBySlug(slug: string): WorkspaceRecord | undefined {
  for (const account of store.accounts.values())
    if (account.workspace.slug === slug) return account.workspace;
  return undefined;
}
