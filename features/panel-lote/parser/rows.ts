// The row model every reader produces (CSV here, the sheet reader in T73):
// arrays of cell text indexed by column. Header text never becomes an object
// key (Security C6). Values are kept as text; nothing is evaluated.

import { MAX_ROWS } from "@/features/panel-lote/validation";
import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

/** Security C7: only the first 50 columns count; cells beyond them are ignored. */
export const MAX_COLUMNS = 50;

export type ReadError = "empty" | "too_many" | "unreadable";
export type ReadResult =
  { ok: true; rows: string[][] } | { ok: false; error: ReadError };

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

/**
 * A cell read as a CNPJ (QA Q2): one leading ' (Excel's text-forcing
 * prefix) is dropped, and an all-digit value of 12–13 digits is left-padded
 * to 14 (Excel drops leading zeros, in CSV too); then normalizeCnpj. The
 * check digits decide the rest.
 */
export function cnpjFromCell(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("'")) text = text.slice(1);
  if (/^\d{12,13}$/.test(text)) text = text.padStart(14, "0");
  return normalizeCnpj(text);
}

function hasValidCnpj(cells: readonly string[]): boolean {
  return cells.some((cell) => validateCnpj(cnpjFromCell(cell)) === "ok");
}

/**
 * Collects a reader's rows: blank rows are skipped, each row is cut to 50
 * columns, and reading stops once there are more rows than MAX_ROWS plus a
 * possible header (T74 decides the header and checks exactly 5,000 data rows).
 */
export function rowSink(): {
  /** False once the file has too many rows: stop reading. */
  push: (cells: string[]) => boolean;
  finish: () => ReadResult;
} {
  const rows: string[][] = [];
  let tooMany = false;
  return {
    push(cells) {
      if (isBlank(cells)) return true;
      if (rows.length === MAX_ROWS + 1) {
        tooMany = true;
        return false;
      }
      rows.push(
        cells.length > MAX_COLUMNS ? cells.slice(0, MAX_COLUMNS) : cells,
      );
      return true;
    },
    finish() {
      if (tooMany) return { ok: false, error: "too_many" };
      // No rows, or a lone header (no CNPJ in it): nothing to verify (AC 15).
      const [first] = rows;
      if (first === undefined || (rows.length === 1 && !hasValidCnpj(first)))
        return { ok: false, error: "empty" };
      return { ok: true, rows };
    },
  };
}
