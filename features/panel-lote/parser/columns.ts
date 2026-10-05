// The sheet's analysis (spec J3.3, O-09; ADR-0012 items 1–2): which row is the
// header, which column holds the CNPJ, the optional columns, and per-column
// counts; then the payload for the chosen column. Pure: it runs in the worker.
// Header text is matched, never used as an object key (Security C6).

import {
  MAX_ROWS,
  isValidExtId,
  isValidResponsavel,
} from "@/features/panel-lote/validation";
import { cnpjFromCell } from "@/features/panel-lote/parser/rows";
import { validateCnpj } from "@/lib/cnpj";
import type { BatchLinha } from "@/lib/panel-api-values";

/** Per column: valid (distinct), repeats after the first, and invalid cells. */
export type ColumnStats = {
  valid: number;
  duplicates: number;
  invalid: number;
};

export type Detected = { cnpj?: number; responsavel?: number; extId?: number };

export type Analysis = {
  /** The header row's text, or "A", "B", … when the sheet has none. */
  headers: string[];
  hasHeader: boolean;
  /** Where the data rows start (rows above a found header are ignored, Q1). */
  dataStart: number;
  dataRows: number;
  /** The first 5 data rows (the worker cuts each cell for the page, T75). */
  preview: string[][];
  stats: ColumnStats[];
  detected: Detected;
};

export type AnalyzeResult =
  { ok: true; analysis: Analysis } | { ok: false; error: "empty" | "too_many" };

const PREVIEW_ROWS = 5;
/** QA Q1: the header is searched for among the first 10 non-blank rows. */
const HEADER_SEARCH_ROWS = 10;
const SHAPED_SHARE = 0.8;
const CNPJ_SHAPE = /^[0-9A-Z]{12}[0-9]{2}$/;
const RESPONSAVEL_HEADERS = ["responsavel", "nome do responsavel"];
const EXT_ID_HEADERS = ["id na plataforma", "id", "ext_id", "id externo"];

/** Lowercase, accents dropped, inner spaces collapsed: "Responsável " → "responsavel". */
function headerKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** QA Q1b: punctuation and spaces stripped too, so "C.N.P.J." and "CNPJ/CPF" match. */
function mentionsCnpj(text: string): boolean {
  return headerKey(text)
    .replace(/[^a-z0-9]/g, "")
    .includes("cnpj");
}

/** "A", "B", … "Z", "AA", "AB", … */
function columnLetter(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const isValid = (cell: string): boolean =>
  validateCnpj(cnpjFromCell(cell)) === "ok";

function statsFor(rows: readonly string[][], column: number): ColumnStats {
  const seen = new Set<string>();
  const stats = { valid: 0, duplicates: 0, invalid: 0 };
  for (const row of rows) {
    const cnpj = cnpjFromCell(row[column] ?? "");
    if (validateCnpj(cnpj) !== "ok") stats.invalid++;
    else if (seen.has(cnpj)) stats.duplicates++;
    else {
      seen.add(cnpj);
      stats.valid++;
    }
  }
  return stats;
}

/** O-09: a header with the word "cnpj" wins; else ≥ 80 % CNPJ-shaped values. */
function cnpjColumn(
  headers: readonly string[] | undefined,
  rows: readonly string[][],
  columns: number,
): number | undefined {
  const byName = headers?.findIndex(mentionsCnpj);
  if (byName !== undefined && byName >= 0) return byName;
  for (let column = 0; column < columns; column++) {
    let filled = 0;
    let shaped = 0;
    for (const row of rows) {
      const cell = (row[column] ?? "").trim();
      if (cell === "") continue;
      filled++;
      if (CNPJ_SHAPE.test(cnpjFromCell(cell))) shaped++;
    }
    if (filled > 0 && shaped / filled >= SHAPED_SHARE) return column;
  }
  return undefined;
}

function optionalColumn(
  headers: readonly string[],
  names: readonly string[],
): number | undefined {
  const index = headers.findIndex((text) => names.includes(headerKey(text)));
  return index >= 0 ? index : undefined;
}

/**
 * The header (QA Q1): the first row, among the first 10, with a cell that
 * mentions "cnpj"; rows above it (an ERP's title) are ignored. Otherwise the
 * first row is the header unless its candidate CNPJ cell validates as a CNPJ:
 * then the sheet has no header and columns are named by letter. Without a
 * header there are no optional columns.
 */
export function analyzeRows(rows: readonly string[][]): AnalyzeResult {
  if (rows.length === 0) return { ok: false, error: "empty" };
  const columns = Math.max(...rows.map((row) => row.length));

  const named = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some(mentionsCnpj));
  let dataStart: number;
  if (named >= 0) dataStart = named + 1;
  else {
    const first = rows[0] ?? [];
    const candidate = cnpjColumn(first, rows.slice(1), columns);
    const headerless =
      first.some(isValid) &&
      (candidate === undefined || isValid(first[candidate] ?? ""));
    dataStart = headerless ? 0 : 1;
  }
  const hasHeader = dataStart > 0;
  const first = rows[dataStart - 1] ?? [];
  const data = rows.slice(dataStart);
  if (data.length === 0) return { ok: false, error: "empty" };
  if (data.length > MAX_ROWS) return { ok: false, error: "too_many" };

  const headers = Array.from({ length: columns }, (_, column) =>
    hasHeader && (first[column] ?? "").trim() !== ""
      ? (first[column] ?? "")
      : columnLetter(column),
  );
  const cnpj = cnpjColumn(hasHeader ? first : undefined, data, columns);
  const responsavel = hasHeader
    ? optionalColumn(first, RESPONSAVEL_HEADERS)
    : undefined;
  const extId = hasHeader ? optionalColumn(first, EXT_ID_HEADERS) : undefined;

  return {
    ok: true,
    analysis: {
      headers,
      hasHeader,
      dataStart,
      dataRows: data.length,
      preview: data.slice(0, PREVIEW_ROWS),
      stats: Array.from({ length: columns }, (_, column) =>
        statsFor(data, column),
      ),
      detected: {
        ...(cnpj !== undefined && { cnpj }),
        ...(responsavel !== undefined && { responsavel }),
        ...(extId !== undefined && { extId }),
      },
    },
  };
}

/**
 * The D-B1 rows for `column`: valid CNPJs in the wire format, the first
 * occurrence winning (with its own optional cells), in file order. An
 * optional cell over its cap or off its charset is dropped; the row stays
 * (ADR-0012 item 2).
 */
export function buildPayload(
  rows: readonly string[][],
  analysis: Pick<Analysis, "dataStart" | "detected">,
  column: number,
): BatchLinha[] {
  const data = rows.slice(analysis.dataStart);
  const { responsavel, extId } = analysis.detected;
  const seen = new Set<string>();
  const linhas: BatchLinha[] = [];
  for (const row of data) {
    const cnpj = cnpjFromCell(row[column] ?? "");
    if (validateCnpj(cnpj) !== "ok" || seen.has(cnpj)) continue;
    seen.add(cnpj);
    const linha: BatchLinha = { cnpj };
    const nome = (responsavel === undefined ? "" : (row[responsavel] ?? ""))
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ");
    if (nome !== "" && isValidResponsavel(nome)) linha.responsavel = nome;
    const id = (extId === undefined ? "" : (row[extId] ?? "")).trim();
    if (id !== "" && isValidExtId(id)) linha.ext_id = id;
    linhas.push(linha);
  }
  return linhas;
}
