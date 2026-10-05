// Lote's limits and row checks as plain constants and functions (ADR-0010
// Addendum 1 rule 8: no zod in the panel's client graph). The worker's row
// checks and the server's zod for startBatchAction (schemas.ts, T74) are both
// built from these, so they accept and reject the same rows.

import {
  isBatchId,
  isBatchRowStatus,
  isPanelCursor,
} from "@/lib/panel-api-values";

/** D-B1: 1–5,000 rows per batch (spec J3, AC 15). */
export const MAX_ROWS = 5000;

/** ADR-0012: a bigger file is refused before it's read (shown as lote.error.unreadable). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Contract C4 / threat model F07: `responsavel` ≤ 120 characters. */
export const RESPONSAVEL_MAX = 120;

/** Contract C4: `ext_id` ≤ 64 printable characters. */
export const EXT_ID_MAX = 64;

// F07 (the seller link's name charset, security finding 0001): Unicode
// letters, each with at most two combining marks, plus space, apostrophe,
// hyphen and period. The Hangul fillers render blank, so they're excluded.
// Kept in step with features/seller-link/schemas.ts by the tests (that module
// pulls zod, which the panel's client graph must not).
const BLANK_LETTERS = "\\u115F\\u1160\\u3164\\uFFA0";
const RESPONSAVEL_PATTERN = new RegExp(
  `^(?:(?![${BLANK_LETTERS}])\\p{L}\\p{M}{0,2}|[ '.-])+$`,
  "u",
);

// Printable ASCII: no control characters and nothing non-ASCII (F07).
const EXT_ID_PATTERN = /^[\x20-\x7E]+$/;

/** A `responsavel` the API accepts: 1–120 characters of the F07 charset. */
export function isValidResponsavel(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= RESPONSAVEL_MAX &&
    RESPONSAVEL_PATTERN.test(value)
  );
}

/** An `ext_id` the API accepts: 1–64 printable ASCII characters. */
export function isValidExtId(value: string): boolean {
  return (
    value.length > 0 && value.length <= EXT_ID_MAX && EXT_ID_PATTERN.test(value)
  );
}

/** A `batchId` the panel may route or request (A-X3 + Security C10: 22–64); anything else is a 404 with no API call. */
export { isBatchId };

/** `?cursor=` on the result table (A-X6, C2); a malformed one falls back to page one. */
export const isBatchCursor = isPanelCursor;

/** `?status=` on the result table (D-B3); anything else shows every row. */
export { isBatchRowStatus };
