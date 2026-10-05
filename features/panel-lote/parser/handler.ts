// The parser worker's logic (ADR-0012 items 1–4, Security C6–C8), as a plain
// function so tests call it directly: sniff → read → analyze on `parse`,
// the payload on `build`. The sheet stays here; only the preview (≤ 5 rows ×
// 50 cells × 80 characters, stats, detected columns) and, on request, the
// payload cross to the page. Errors are only the four codes; nothing is
// logged, and the file's name never leaves (C8).

import {
  analyzeRows,
  buildPayload,
  type Analysis,
} from "@/features/panel-lote/parser/columns";
import { readCsv } from "@/features/panel-lote/parser/csv";
import {
  PREVIEW_CELL_CHARS,
  PREVIEW_MAX_COLUMNS,
  type ParseError,
  type WorkerMessage,
} from "@/features/panel-lote/parser/protocol";
import { readWorkbook } from "@/features/panel-lote/parser/sheet";
import { SNIFF_BYTES, sniffFile } from "@/features/panel-lote/parser/sniff";

type Parsed = { rows: string[][]; analysis: Analysis };

const cell = (text: string): string => text.slice(0, PREVIEW_CELL_CHARS);
const cells = (row: readonly string[]): string[] =>
  row.slice(0, PREVIEW_MAX_COLUMNS).map(cell);

function isParse(message: unknown): message is { kind: "parse"; file: File } {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "parse" &&
    (message as { file?: unknown }).file instanceof Blob
  );
}

function isBuild(
  message: unknown,
): message is { kind: "build"; column: number } {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "build" &&
    Number.isInteger((message as { column?: unknown }).column)
  );
}

async function parse(file: File): Promise<Parsed | ParseError> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffFile({ name: file.name, size: file.size, head });
  if (!sniffed.ok) return sniffed.error === "type" ? "type" : "unreadable";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const read =
    sniffed.format === "csv"
      ? readCsv(bytes)
      : await readWorkbook(bytes, sniffed.format);
  if (!read.ok) return read.error;
  const analyzed = analyzeRows(read.rows);
  if (!analyzed.ok) return analyzed.error;
  return { rows: read.rows, analysis: analyzed.analysis };
}

/** A handler for the worker's messages; `post` is postMessage. */
export function createParserHandler(
  post: (message: WorkerMessage) => void,
): (message: unknown) => Promise<void> {
  let parsed: Parsed | undefined;

  return async (message) => {
    if (isParse(message)) {
      parsed = undefined;
      let result: Parsed | ParseError;
      try {
        result = await parse(message.file);
      } catch {
        // Never the message or the stack: they can quote the file (C8).
        result = "unreadable";
      }
      if (typeof result === "string") {
        post({ kind: "error", error: result });
        return;
      }
      parsed = result;
      const { analysis } = result;
      post({
        kind: "preview",
        headers: cells(analysis.headers),
        rows: analysis.preview.map(cells),
        stats: analysis.stats.slice(0, PREVIEW_MAX_COLUMNS),
        detected: analysis.detected,
      });
      return;
    }
    if (isBuild(message) && parsed !== undefined) {
      const { column } = message;
      if (column < 0 || column >= parsed.analysis.headers.length) return;
      const linhas = buildPayload(parsed.rows, parsed.analysis, column);
      // The sheet leaves the worker's memory once the payload is out.
      parsed = undefined;
      post({ kind: "payload", linhas });
    }
  };
}
