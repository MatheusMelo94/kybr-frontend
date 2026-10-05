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
