// XLSX and XLS through the vendored SheetJS CE (ADR-0012 item 4): the zip
// guard first (C7 v1.1), then read() with the ADR's options, the first
// visible sheet, cached values only. It gives the same row model as readCsv.
// Header text is never an object key (C6): rows are arrays by column.

import { CFB, read, type CellObject, type WorkBook } from "xlsx";

import { rowSink, type ReadResult } from "@/features/panel-lote/parser/rows";
import { zipGuard } from "@/features/panel-lote/parser/zip-guard";

/**
 * SheetJS reads at most this many physical rows (`sheetRows`): the memory
 * and CPU bound. Rows past it are not read (Amendment 3).
 */
const SHEET_ROWS = 10_001;

const OPTIONS = {
  type: "array",
  dense: true,
  sheetRows: SHEET_ROWS,
  cellFormula: false,
  cellHTML: false,
  cellStyles: false,
  cellDates: false,
  bookVBA: false,
} as const;

export type SheetResult = ReadResult | { ok: false; error: "type" };

const unreadable: SheetResult = { ok: false, error: "unreadable" };

/**
 * A cell's text: its cached value, never a formula. An integer of 12–13
 * digits is left-padded to 14 (Excel drops a CNPJ's leading zeros; QA Q2
 * pads the same in CSV), other integers are their digits, and anything else
 * is its displayed text.
 */
function cellText(cell: CellObject | undefined): string {
  if (cell === undefined || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "e") return "";
  if (cell.t === "b") return cell.v ? "TRUE" : "FALSE";
  if (typeof cell.v === "number") {
    if (Number.isSafeInteger(cell.v) && cell.v >= 0) {
      const digits = String(cell.v);
      return digits.length === 12 || digits.length === 13
        ? digits.padStart(14, "0")
        : digits;
    }
    return cell.w ?? String(cell.v);
  }
  return String(cell.v);
}

/** BIFF8 keeps its stream in "Workbook"; BIFF5 and older ("Book") need codepages. */
function isBiff8(bytes: Uint8Array): boolean {
  const container = CFB.read(bytes, { type: "array" });
  return CFB.find(container, "Workbook") !== null;
}

function firstVisible(workbook: WorkBook): string | undefined {
  return workbook.SheetNames.find(
    (_, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden,
  );
}

export async function readWorkbook(
  bytes: Uint8Array,
  format: "xlsx" | "xls",
): Promise<SheetResult> {
  if (format === "xlsx") {
    const guarded = await zipGuard(bytes);
    if (!guarded.ok) return guarded;
  }
  let workbook: WorkBook;
  try {
    if (format === "xls" && !isBiff8(bytes)) return unreadable;
    workbook = read(bytes, OPTIONS);
  } catch {
    // SheetJS's messages can quote the file: never kept or logged (C8).
    return unreadable;
  }

  const name = firstVisible(workbook);
  const sheet = name === undefined ? undefined : workbook.Sheets[name];
  if (sheet === undefined) return unreadable;
  // ADR-0012 Amendment 3 (QA-M5-001): the sheet's declared range (!ref,
  // !fullref) is never a refusal: Excel files often declare far more rows
  // than they hold (formatting below the data, a stale dimension). SheetJS
  // reads at most 10,001 physical rows; too_many comes only from more than
  // 5,000 non-blank data rows among them (rowSink).
  const sink = rowSink();
  const data = (sheet["!data"] ?? []) as (CellObject | undefined)[][];
  for (const row of data) {
    const cells = Array.from(row ?? [], (cell) => cellText(cell));
    if (!sink.push(cells)) break;
  }
  return sink.finish();
}
