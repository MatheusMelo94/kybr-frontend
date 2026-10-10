import { delay, http, HttpResponse, type RequestHandler } from "msw";

import {
  ALERT_DEFAULTS,
  ALERT_EMAILS,
  alertCase,
  sweptMonitoring,
  type AlertRecord,
} from "../../factories/panel.ts";
import {
  ALERT_FAULT_KINDS,
  addAlert,
  addCase,
  alertsOf,
  caseNow,
  isAlertPreset,
  monitoringOf,
  panelStore,
  scenarioApplies,
  seedAlerts,
  sessionAccount,
  setAlertFault,
  setMonitoring,
  takeAlertFault,
  type Account,
  type AlertEndpoint,
  type AlertFault,
} from "../panel-store.ts";
import { apiError, incoming, networkDrop, ok } from "./panel-common.ts";

// Pre-Contract handlers for the Monitoramento (ops-panel contract-request.md
// D-M1–D-M3, C-M7-1–C-M7-5, MSW scenarios PM1–PM9) and their loopback
// controls (QA's M7 fixture gaps G1–G8). Every fault and seed is per
// account: the E2E projects share one mock.

const ISO = (ms: number): string => new Date(ms).toISOString();
const CNPJ = /^[0-9A-Z]{12}[0-9]{2}$/; // A-X5
const LIMIT_MAX = 50; // C-M7-5
const APP_ORIGIN = "https://app.kybr.com.br"; // D-M3's CTA host

async function authed(
  request: Request,
  endpoint: AlertEndpoint,
  scenario: "alertas-falha" | "monitoramento-falha",
): Promise<{ account: Account } | { reply: Response }> {
  const { token, refused, call } = await incoming(request);
  if (refused) return { reply: refused };
  // M7 reads are page renders, never polls: they keep the session alive.
  const account = sessionAccount(token);
  if (!account) return { reply: apiError(401, "SESSAO_EXPIRADA") };
  call.email = account.email;
  if (scenarioApplies(scenario, account.email))
    return { reply: apiError(503, "INDISPONIVEL") };
  const fault = takeAlertFault(account.email, endpoint);
  if (fault?.kind === "delay") await delay(fault.ms ?? 1_000);
  if (fault?.kind === "500") return { reply: apiError(500, "ERRO_INTERNO") };
  if (fault?.kind === "503") return { reply: apiError(503, "INDISPONIVEL") };
  if (fault?.kind === "drop") return { reply: networkDrop() };
  return { account };
}

/** D-M1 item: case_decisao comes from the case itself (PM6's decision). */
function alertView(alert: AlertRecord): Record<string, unknown> {
  const decisao =
    alert.case_id === undefined
      ? undefined
      : panelStore().cases.get(alert.case_id)?.decisao?.tipo;
  return {
    id: alert.id,
    tipo: alert.tipo,
    severidade: alert.severidade,
    seller: { ...alert.seller },
    dados: { ...alert.dados },
    detectado_em: ISO(alert.detectado_em),
    ...(alert.case_id !== undefined && { case_id: alert.case_id }),
    ...(decisao !== undefined && { case_decisao: decisao }),
    ...(alert.pedido_aberto === true && { pedido_aberto: true }),
  };
}

export const panelAlertHandlers: RequestHandler[] = [
  // D-M1 (+ C-M7-3/5)
  http.get("*/v1/alerts", async ({ request }) => {
    const auth = await authed(request, "alerts", "alertas-falha");
    if ("reply" in auth) return auth.reply;
    const limit = Number(new URL(request.url).searchParams.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX)
      return apiError(422, "VALOR_INVALIDO", { field: "limit" });
    return ok(alertsOf(auth.account.email).slice(0, limit).map(alertView));
  }),

  // D-M2 (C-M7-2): an account M7 never seeded monitors nothing.
  http.get("*/v1/monitoring", async ({ request }) => {
    const auth = await authed(request, "monitoring", "monitoramento-falha");
    if ("reply" in auth) return auth.reply;
    const record = monitoringOf(auth.account.email) ?? {
      ativo: false,
      monitorados: 0,
    };
    return ok({
      ativo: record.ativo,
      monitorados: record.monitorados,
      ...(record.ultima_varredura !== undefined && {
        ultima_varredura: ISO(record.ultima_varredura),
      }),
      ...(record.proxima_varredura !== undefined && {
        proxima_varredura: ISO(record.proxima_varredura),
      }),
    });
  }),
];

// --- Loopback-only controls -----------------------------------------------------

async function controlBody(request: Request): Promise<Record<string, unknown>> {
  const parsed = (await request.json().catch(() => ({}))) as unknown;
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

const ALERT_ENDPOINTS: readonly AlertEndpoint[] = ["alerts", "monitoring"];

let sweepN = 0;

export const panelAlertControlHandlers: RequestHandler[] = [
  // QA G1: { email, preset } replaces the account's alerts (creating it if needed).
  http.post("*/__mock/panel/alerts/seed", async ({ request }) => {
    const { email, preset } = await controlBody(request);
    if (typeof email !== "string" || !isAlertPreset(preset))
      return new HttpResponse(null, { status: 400 });
    seedAlerts(email, preset);
    return HttpResponse.json(
      alertsOf(email.toLowerCase()).map((alert) => ({
        id: alert.id,
        tipo: alert.tipo,
        case_id: alert.case_id ?? null,
      })),
      { status: 201 },
    );
  }),
  // PM6 / D-M3: { email?, cnpj, tipo, dados?, severidade? } as the sweep
  // finds it. A critico alert opens a monitoramento case and mails the link.
  http.post("*/__mock/panel/sweep", async ({ request }) => {
    const body = await controlBody(request);
    const email =
      typeof body.email === "string"
        ? body.email.toLowerCase()
        : ALERT_EMAILS.alertas;
    const tipo = typeof body.tipo === "string" ? body.tipo : "";
    const defaults = ALERT_DEFAULTS[tipo];
    if (
      !defaults ||
      typeof body.cnpj !== "string" ||
      !CNPJ.test(body.cnpj) ||
      !panelStore().accounts.has(email)
    )
      return new HttpResponse(null, { status: 400 });
    const now = caseNow(email);
    const severidade =
      typeof body.severidade === "string"
        ? body.severidade
        : defaults.severidade;
    const dados =
      typeof body.dados === "object" && body.dados !== null
        ? (body.dados as Record<string, string>)
        : defaults.dados;
    const kase =
      severidade === "critico" && tipo !== "WEBHOOK_FALHOU"
        ? alertCase(email, { n: 950 + (sweepN++ % 40), now, cnpj: body.cnpj })
        : undefined;
    const alert: AlertRecord = {
      id: crypto.randomUUID(),
      email,
      tipo,
      severidade,
      seller: kase
        ? { ...kase.seller }
        : {
            id: crypto.randomUUID(),
            razao_social: "Empresa Exemplo Varredura Ltda",
            cnpj: body.cnpj,
          },
      dados: { ...dados },
      detectado_em: now,
    };
    if (kase) {
      addCase(kase);
      alert.case_id = kase.id;
      const store = panelStore();
      store.outbox.set(email, {
        ...store.outbox.get(email),
        alerta: {
          assunto: `Alerta crítico: ${alert.seller.razao_social ?? alert.seller.cnpj}`,
          link: `${APP_ORIGIN}/fila/${kase.id}`,
        },
      });
    }
    addAlert(alert);
    const swept = sweptMonitoring(now, monitoringOf(email)?.monitorados || 1);
    setMonitoring(email, { ...swept, ultima_varredura: now });
    return HttpResponse.json(
      { id: alert.id, case_id: alert.case_id ?? null },
      { status: 201 },
    );
  }),
  // QA G2: { email, endpoint, kind, ms?, times? } (kind null clears it).
  http.post("*/__mock/panel/alert-fault", async ({ request }) => {
    const { email, endpoint, kind, ms, times } = await controlBody(request);
    if (
      typeof email !== "string" ||
      !ALERT_ENDPOINTS.includes(endpoint as AlertEndpoint) ||
      (kind !== null &&
        !(ALERT_FAULT_KINDS as readonly unknown[]).includes(kind))
    )
      return new HttpResponse(null, { status: 400 });
    setAlertFault(
      email,
      endpoint as AlertEndpoint,
      kind === null
        ? undefined
        : {
            kind: kind as AlertFault["kind"],
            ...(typeof ms === "number" && { ms }),
            ...(typeof times === "number" && { times }),
          },
    );
    return new HttpResponse(null, { status: 204 });
  }),
];
