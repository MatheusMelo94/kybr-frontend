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

// The seller's case link: /v/{slug}/c/{token}, with the link contract's slug
// and token patterns (X3; the token is ≥ 128 bits).
const LINK_VENDEDOR_PATH =
  /^\/v\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\/c\/[A-Za-z0-9_-]{22,64}$/;

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
    LINK_VENDEDOR_PATH.test(url.pathname) &&
    url.href === value;
  return ok ? value : null;
}
