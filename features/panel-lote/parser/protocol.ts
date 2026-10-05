// The messages between useBatchFile() and parser.worker.ts (ADR-0012 item 1,
// Security C8). Plain data only; the page re-checks every message's shape
// with plain functions (no zod in the client graph, ADR-0010 rule 8).
//
// The worker's ready message carries the sentinel "kybr-lote-parser/1"; the
// string itself lives only in parser.worker.ts, so the bundle guard can tell
// the worker chunk from First Load JS (ADR-0012 item 6).

import type {
  ColumnStats,
  Detected,
} from "@/features/panel-lote/parser/columns";
import type { BatchLinha } from "@/lib/panel-api-values";

/** What crosses to the page for the preview: at most 5 rows × 50 cells of 80 characters. */
export const PREVIEW_CELL_CHARS = 80;
export const PREVIEW_MAX_ROWS = 5;
export const PREVIEW_MAX_COLUMNS = 50;

/** The only errors the worker ever posts (C8: never a message, a stack or cell text). */
export type ParseError = "type" | "empty" | "too_many" | "unreadable";
const PARSE_ERRORS: readonly string[] = [
  "type",
  "empty",
  "too_many",
  "unreadable",
];

// Page → worker (C8: exactly these; anything else is ignored).
export type ParseRequest = { kind: "parse"; file: File };
export type BuildRequest = { kind: "build"; column: number };

// Worker → page.
export type WorkerReady = { kind: "ready"; version: string };
export type Preview = {
  kind: "preview";
  headers: string[];
  rows: string[][];
  stats: ColumnStats[];
  detected: Detected;
};
export type ParseFailure = { kind: "error"; error: ParseError };
export type Payload = { kind: "payload"; linhas: BatchLinha[] };
export type WorkerMessage = WorkerReady | Preview | ParseFailure | Payload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnly(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

function isCells(value: unknown, maxCells: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxCells &&
    value.every(
      (cell) => typeof cell === "string" && cell.length <= PREVIEW_CELL_CHARS,
    )
  );
}

function isStats(value: unknown): value is ColumnStats {
  return (
    isRecord(value) &&
    hasOnly(value, ["valid", "duplicates", "invalid"]) &&
    isCount(value.valid) &&
    isCount(value.duplicates) &&
    isCount(value.invalid)
  );
}

function isDetected(value: unknown, columns: number): value is Detected {
  if (!isRecord(value) || !hasOnly(value, ["cnpj", "responsavel", "extId"]))
    return false;
  return Object.values(value).every(
    (index) => isCount(index) && index < columns,
  );
}

export function isWorkerReady(message: unknown): message is WorkerReady {
  return (
    isRecord(message) &&
    message.kind === "ready" &&
    typeof message.version === "string"
  );
}

export function isPreview(message: unknown): message is Preview {
  if (!isRecord(message) || message.kind !== "preview") return false;
  if (!hasOnly(message, ["kind", "headers", "rows", "stats", "detected"]))
    return false;
  const { headers, rows, stats, detected } = message;
  if (!isCells(headers, PREVIEW_MAX_COLUMNS)) return false;
  return (
    Array.isArray(rows) &&
    rows.length <= PREVIEW_MAX_ROWS &&
    rows.every((row) => isCells(row, PREVIEW_MAX_COLUMNS)) &&
    Array.isArray(stats) &&
    stats.length === headers.length &&
    stats.every(isStats) &&
    isDetected(detected, headers.length)
  );
}

export function isParseFailure(message: unknown): message is ParseFailure {
  return (
    isRecord(message) &&
    message.kind === "error" &&
    hasOnly(message, ["kind", "error"]) &&
    typeof message.error === "string" &&
    PARSE_ERRORS.includes(message.error)
  );
}

export function isPayload(message: unknown): message is Payload {
  return (
    isRecord(message) &&
    message.kind === "payload" &&
    hasOnly(message, ["kind", "linhas"]) &&
    Array.isArray(message.linhas) &&
    message.linhas.every(
      (linha) =>
        isRecord(linha) &&
        hasOnly(linha, ["cnpj", "responsavel", "ext_id"]) &&
        typeof linha.cnpj === "string",
    )
  );
}
