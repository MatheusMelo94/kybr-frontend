import { SLUG_PATTERN, TOKEN_PATTERN } from "@/lib/link-values";

// The panel API's id, cursor and batch-row status rules (contract A-X3, A-X6,
// D-B3) as plain functions: the server's path builders (lib/api/path.ts) and
// the panel's client leaves share them (no zod in panel client code, ADR-0010
// Addendum 1 rule 8).

// Panel ids (case, batch, alert, seller): a UUID, or another opaque id (A-X3).
const PANEL_ID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{16,64})$/i;

// Batch ids (Security C10, M4-12): ≥ 128 bits, so 22–64 URL-safe characters.
// A UUID (36 characters of hex and hyphens) fits the same pattern.
const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

// An A-X6 cursor is opaque base64url, at most 512 characters (Security C11);
// anything else falls back to page one with no API call.
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

/** True for an id the panel may put in a URL or an API path (A-X3). Anything else is a 404 with no API call. */
export function isPanelId(value: string): boolean {
  return PANEL_ID_PATTERN.test(value);
}

/** True for a batch id the panel may route or request (A-X3 + C10); anything else is a 404 with no API call. */
export function isBatchId(value: string): boolean {
  return BATCH_ID_PATTERN.test(value);
}

/** True for a cursor the panel may forward to the API (A-X6). */
export function isPanelCursor(value: string): boolean {
  return CURSOR_PATTERN.test(value);
}

/** D-B3 row statuses, in the legend's order. */
export const BATCH_ROW_STATUSES = ["ok", "warn", "bad", "erro"] as const;
export type BatchRowStatus = (typeof BATCH_ROW_STATUSES)[number];

export function isBatchRowStatus(value: string): value is BatchRowStatus {
  return (BATCH_ROW_STATUSES as readonly string[]).includes(value);
}

/** One D-B1 row on the wire (contract C4): the worker builds it, the action checks it. */
export type BatchLinha = {
  cnpj: string;
  responsavel?: string;
  ext_id?: string;
};

// M6 cases (D-C1–D-C5 + C-M6-5/6): the closed sets the Fila branches on and
// keys its copy by. Plain arrays, so client leaves can use them too.

/** D-C1 `estado` filters (the two tabs) and D-C2's full set. */
export const CASE_ESTADOS = ["aberto", "aguardando_doc", "decidido"] as const;
export type CaseEstado = (typeof CASE_ESTADOS)[number];
export const CASE_TAB_ESTADOS = ["aberto", "aguardando_doc"] as const;
export type CaseTabEstado = (typeof CASE_TAB_ESTADOS)[number];

export const CASE_ORIGENS = ["link", "lote", "monitoramento"] as const;
export type CaseOrigem = (typeof CASE_ORIGENS)[number];

export const VEREDITOS = ["aprovar", "revisar", "bloquear"] as const;
export type Veredito = (typeof VEREDITOS)[number];

/** The dot's status (D-C1) and each check's (D-C2). */
export const CASE_STATUSES = ["ok", "warn", "bad"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** D-C3 decisions; `manter` only on monitoramento cases. */
export const DECISAO_TIPOS = ["aprovar", "manter", "bloquear"] as const;
export type DecisaoTipo = (typeof DECISAO_TIPOS)[number];

/** D-C4 document types (the link's `documento.*` keys). */
export const DOCUMENTO_TIPOS = [
  "CONTRATO_SOCIAL_OU_CCMEI",
  "PROCURACAO",
  "COMPROVANTE_ENDERECO",
  "CARTAO_CNPJ",
  "RESPONSAVEL",
] as const;
export type DocumentoTipo = (typeof DOCUMENTO_TIPOS)[number];

export function isDocumentoTipo(value: string): value is DocumentoTipo {
  return (DOCUMENTO_TIPOS as readonly string[]).includes(value);
}

/** D-C3 block reasons (the link's `motivo.codigo` set). */
export const MOTIVO_CODIGOS = [
  "SITUACAO_IRREGULAR",
  "RESPONSAVEL_NAO_SOCIO",
  "EMPRESA_RECENTE",
  "ATIVIDADE_FORA_DA_CATEGORIA",
  "IE_NAO_ENCONTRADA",
  "IE_SUSPENSA",
  "MEI",
  "GENERICO",
] as const;
export type MotivoCodigo = (typeof MOTIVO_CODIGOS)[number];

export function isMotivoCodigo(value: string): value is MotivoCodigo {
  return (MOTIVO_CODIGOS as readonly string[]).includes(value);
}

/** C-M6-5: the history's closed event types (rendered from the spec's copy). */
export const CASE_EVENT_TIPOS = [
  "caso_criado",
  "documento_pedido",
  "documento_recebido",
  "decidido",
  "reverificado",
] as const;
export type CaseEventTipo = (typeof CASE_EVENT_TIPOS)[number];

/** C-M6-6: the six check keys (proposed names; `qsa` drives AC 30). */
export const CHECK_CHAVES = [
  "situacao",
  "qsa",
  "idade",
  "cnae",
  "ie",
  "regime",
] as const;
export type CheckChave = (typeof CHECK_CHAVES)[number];

// The seller's case link: /v/{slug}/c/{token}, each segment checked with the
// link contract's own anchored pattern (X3, imported, never retyped: F8).
function isLinkVendedorPath(pathname: string): boolean {
  const [empty, v, slug, c, token, ...rest] = pathname.split("/");
  return (
    empty === "" &&
    v === "v" &&
    c === "c" &&
    rest.length === 0 &&
    slug !== undefined &&
    token !== undefined &&
    SLUG_PATTERN.test(slug) &&
    TOKEN_PATTERN.test(token)
  );
}

/**
 * F8: a D-C2/D-C4 `link_vendedor` the panel may show (as an input value
 * only, never an href): https on exactly `https://{linkHost}`, the seller
 * case path, no query, fragment or userinfo, and already in canonical form.
 * Anything else is null (the caller logs a shape-only marker).
 */
export function parseLinkVendedor(
  value: string,
  linkHost: string,
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const ok =
    url.protocol === "https:" &&
    url.origin === `https://${linkHost}` &&
    url.username === "" &&
    url.password === "" &&
    !value.includes("?") &&
    !value.includes("#") &&
    isLinkVendedorPath(url.pathname) &&
    url.href === value;
  return ok ? value : null;
}

// M7 alerts (D-M1 + C-M7-1): the closed sets the Monitoramento page keys
// its copy by (`alert.<TIPO>`, `alert.sev.*`).

/** D-M1 alert types, each with its own `dados` placeholders (C-M7-1). */
export const ALERT_TIPOS = [
  "SITUACAO_IRREGULAR",
  "IE_SUSPENSA",
  "RESPONSAVEL_SAIU_QSA",
  "QSA_MUDOU",
  "CNAE_MUDOU",
  "REGIME_MUDOU",
  "WEBHOOK_FALHOU",
] as const;
export type AlertTipo = (typeof ALERT_TIPOS)[number];

/** D-M1 severities, most severe first. */
export const ALERT_SEVERIDADES = ["critico", "atencao", "info"] as const;
export type AlertSeveridade = (typeof ALERT_SEVERIDADES)[number];

// M8 sellers and policies (C-M8-2–C-M8-6). Like the others: an unknown
// value fails the parse, and the copy is keyed by these.

/** D-S1 `status` (and the Vendedores filter). */
export const SELLER_STATUSES = [
  "aprovado",
  "revisao",
  "bloqueado",
  "mudou",
] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export function isSellerStatus(value: string): value is SellerStatus {
  return (SELLER_STATUSES as readonly string[]).includes(value);
}

/** D-S1 `origem`: a seller arrives through the link or a batch only. */
export const SELLER_ORIGENS = ["link", "lote"] as const;
export type SellerOrigem = (typeof SELLER_ORIGENS)[number];

/** D-R1 rule keys, in the screen's order (`regras.rule.<chave>`). */
export const POLICY_CHAVES = [
  "situacao",
  "recente",
  "qsa",
  "cnae",
  "ie",
  "mei",
  "ok",
] as const;
export type PolicyChave = (typeof POLICY_CHAVES)[number];

/** D-R1 actions (`regras.action.<acao>`). */
export const POLICY_ACOES = [
  "auto",
  "approve",
  "approve_limit",
  "review",
  "request",
  "block",
] as const;
export type PolicyAcao = (typeof POLICY_ACOES)[number];

/** D-R1 `recente.dias` bounds (C-M8-6). */
export const POLICY_DIAS_MIN = 1;
export const POLICY_DIAS_MAX = 3650;

/** D-W2 category ids (and D-R1's `{categoria}` path segment). */
export const CATEGORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** D-S1 / D-S4 `q`: at most 100 characters (C-M8-2). */
export const SELLER_QUERY_MAX = 100;

/** A real calendar day as YYYY-MM-DD (D-S5's `de` / `ate`). */
export function isCalendarDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
