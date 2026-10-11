import { delay, http, HttpResponse, type RequestHandler } from "msw";

import { HOME_PRESETS, type HomePreset } from "../../factories/panel.ts";
import {
  HOME_FAULT_KINDS,
  alertsOf,
  caseNow,
  casesOf,
  dashboardOf,
  seedDashboard,
  sessionAccount,
  sessionsOf,
  setHomeFault,
  takeHomeFault,
  type Account,
  type HomeEndpoint,
  type HomeFault,
} from "../panel-store.ts";
import { alertView } from "./panel-alerts.ts";
import { summaryView } from "./panel-cases.ts";
import {
  apiError,
  incoming,
  networkDrop,
  noContent,
  ok,
  type Incoming,
} from "./panel-common.ts";

// Pre-Contract handlers for Início (ops-panel contract-request.md D-H1/D-H2,
// C-M8-1, MSW scenarios PH1–PH5) and the M8a loopback controls (QA's M8
// fixture gaps G1, G2, G4, G7). Every fault and seed is per account: the
// E2E projects share one mock.

const DAY_MS = 86_400_000;
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60_000; // UTC−3, no DST since 2019
const CARD_LIMIT = 4; // C-M8-1
const DASHBOARD_FIELDS = [
  "kpis",
  "fila",
  "alertas",
  "semana",
  "primeiros_passos",
] as const;

/**
 * The session's account, with the call logged under it (QA G5), and the
 * account's fault for `endpoint` applied (QA G2). Exported for the M8a
 * settings and password handlers.
 */
export async function homeAuthed(
  request: Request,
  endpoint: HomeEndpoint,
): Promise<
  | { account: Account; fault?: HomeFault; incoming: Incoming }
  | { reply: Response }
> {
  const seen = await incoming(request);
  if (seen.refused) return { reply: seen.refused };
  const account = sessionAccount(seen.token);
  if (!account) return { reply: apiError(401, "SESSAO_EXPIRADA") };
  seen.call.email = account.email;
  const fault = takeHomeFault(account.email, endpoint);
  if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
  if (fault?.kind === "500") return { reply: apiError(500, "ERRO_INTERNO") };
  if (fault?.kind === "503") return { reply: apiError(503, "INDISPONIVEL") };
  if (fault?.kind === "drop") return { reply: networkDrop() };
  return { account, incoming: seen, ...(fault && { fault }) };
}

/** Seven São Paulo calendar days ending at `now`'s, oldest first. */
function lastSevenDays(now: number): string[] {
  const today = Math.floor((now - SAO_PAULO_OFFSET_MS) / DAY_MS);
  return Array.from({ length: 7 }, (_, i) =>
    new Date((today - 6 + i) * DAY_MS).toISOString().slice(0, 10),
  );
}

function dashboardView(account: Account): Record<string, unknown> {
  const record = dashboardOf(account.email);
  const now = caseNow(account.email);
  const fila = casesOf(account.email)
    .filter((kase) => kase.estado === "aberto")
    .sort((a, b) => a.criado_em - b.criado_em)
    .slice(0, CARD_LIMIT)
    .map((kase) => summaryView(kase, now));
  const dias = lastSevenDays(now);
  return {
    kpis: { ...record.kpis },
    fila,
    alertas: alertsOf(account.email).slice(0, CARD_LIMIT).map(alertView),
    semana: dias.map((dia, i) => ({ dia, total: record.semana[i] ?? 0 })),
    primeiros_passos: { ...record.primeiros_passos },
  };
}

export const panelHomeHandlers: RequestHandler[] = [
  // D-H1 (C-M8-1): PH3's omit fault leaves out the named fields.
  http.get("*/v1/dashboard", async ({ request }) => {
    const auth = await homeAuthed(request, "dashboard");
    if ("reply" in auth) return auth.reply;
    const view = dashboardView(auth.account);
    if (auth.fault?.kind === "omit")
      for (const field of auth.fault.sem ?? []) delete view[field];
    return ok(view as Record<string, never>);
  }),

  // D-H2: exactly { oculto: true } → 204, idempotent (PH5).
  http.put("*/v1/dashboard/primeiros-passos", async ({ request }) => {
    const auth = await homeAuthed(request, "first-steps");
    if ("reply" in auth) return auth.reply;
    const { body } = auth.incoming;
    if (Object.keys(body).length !== 1 || body.oculto !== true)
      return apiError(422, "VALOR_INVALIDO", { field: "oculto" });
    dashboardOf(auth.account.email).primeiros_passos.oculto = true;
    return noContent();
  }),
];

// --- Loopback-only controls -----------------------------------------------------

async function controlBody(request: Request): Promise<Record<string, unknown>> {
  const parsed = (await request.json().catch(() => ({}))) as unknown;
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

function isHomePreset(value: unknown): value is HomePreset {
  return (HOME_PRESETS as readonly unknown[]).includes(value);
}

/** { kind, ms?, times?, sem? } as a fault, null to clear, or "bad". */
function faultFrom(
  body: Record<string, unknown>,
  allowOmit: boolean,
): HomeFault | undefined | "bad" {
  const { kind, ms, times, sem } = body;
  if (kind === null) return undefined;
  if (
    !(HOME_FAULT_KINDS as readonly unknown[]).includes(kind) ||
    (kind === "omit" && !allowOmit)
  )
    return "bad";
  if (
    kind === "omit" &&
    (!Array.isArray(sem) ||
      !sem.every((field) =>
        (DASHBOARD_FIELDS as readonly unknown[]).includes(field),
      ))
  )
    return "bad";
  return {
    kind: kind as HomeFault["kind"],
    ...(typeof ms === "number" && { ms }),
    ...(typeof times === "number" && { times }),
    ...(kind === "omit" && { sem: sem as string[] }),
  };
}

const SETTINGS_ENDPOINTS: readonly HomeEndpoint[] = [
  "first-steps",
  "workspace-put",
  "me-put",
  "password",
];

async function digest(id: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id),
  );
  return Buffer.from(bytes).toString("hex").slice(0, 16);
}

export const panelHomeControlHandlers: RequestHandler[] = [
  // QA G1: { email, preset } seeds the account's dashboard (creating it if needed).
  http.post("*/__mock/panel/dashboard/seed", async ({ request }) => {
    const { email, preset } = await controlBody(request);
    if (typeof email !== "string" || !isHomePreset(preset))
      return new HttpResponse(null, { status: 400 });
    seedDashboard(email, preset);
    return new HttpResponse(null, { status: 201 });
  }),
  // QA G2 / PH3 / PH4: { email, kind, ms?, times?, sem? } (kind null clears it).
  http.post("*/__mock/panel/dashboard/fault", async ({ request }) => {
    const body = await controlBody(request);
    const fault = faultFrom(body, true);
    if (typeof body.email !== "string" || fault === "bad")
      return new HttpResponse(null, { status: 400 });
    setHomeFault(body.email, "dashboard", fault);
    return new HttpResponse(null, { status: 204 });
  }),
  // QA G2: { email, endpoint, kind, ms?, times? } for D-H2, D-W3/D-W4 PUT and D-A6.
  http.post("*/__mock/panel/settings-fault", async ({ request }) => {
    const body = await controlBody(request);
    const fault = faultFrom(body, false);
    if (
      typeof body.email !== "string" ||
      !SETTINGS_ENDPOINTS.includes(body.endpoint as HomeEndpoint) ||
      fault === "bad"
    )
      return new HttpResponse(null, { status: 400 });
    setHomeFault(body.email, body.endpoint as HomeEndpoint, fault);
    return new HttpResponse(null, { status: 204 });
  }),
  // QA G7: ?email= → each session's digest (SHA-256, 16 hex), creation and
  // revoked flag. Never a session id.
  http.get("*/__mock/panel/sessions", async ({ request }) => {
    const email = (
      new URL(request.url).searchParams.get("email") ?? ""
    ).toLowerCase();
    const sessions = await Promise.all(
      sessionsOf(email).map(async (session) => ({
        ref: await digest(session.id),
        criada_em: new Date(session.createdAt).toISOString(),
        revogada: session.revogada,
      })),
    );
    return HttpResponse.json(sessions);
  }),
];
