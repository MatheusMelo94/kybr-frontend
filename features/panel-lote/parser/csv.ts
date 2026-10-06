// Lote's CSV reader (ADR-0012 item 3): RFC 4180 quoting, strict UTF-8 then
// Windows-1252, the delimiter sniffed among ; , and tab. Values only: nothing
// is evaluated. Security C7 caps a field and a line so one huge line can't
// become a huge array.

import { rowSink, type ReadResult } from "@/features/panel-lote/parser/rows";

/** Security C7: a field over 32 Ki characters → unreadable. */
export const MAX_FIELD_LENGTH = 32 * 1024;

/** Security C7: a line over 256 fields → unreadable. */
export const MAX_FIELDS_PER_LINE = 256;

const DELIMITERS = [";", ",", "\t"] as const;

/** Strict UTF-8 (a BOM is stripped), else Windows-1252 (Excel's pt-BR "CSV"). */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The most frequent delimiter outside quotes on the first non-blank line; ties go to ";". */
function sniffDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  let content = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (content) break;
    } else if (!quoted && counts.has(char))
      counts.set(char, (counts.get(char) ?? 0) + 1);
    else if (char.trim() !== "") content = true;
  }
  let best: string = ";";
  for (const delimiter of DELIMITERS)
    if ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0))
      best = delimiter;
  return best;
}

export function readCsv(bytes: Uint8Array): ReadResult {
  const text = decode(bytes);
  const delimiter = sniffDelimiter(text);
  const sink = rowSink();
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // False when a cap was hit (the caller stops).
  const endField = (): boolean => {
    row.push(field);
    field = "";
    return row.length <= MAX_FIELDS_PER_LINE;
  };
  const endRow = (): boolean | "too_many" => {
    if (!endField()) return false;
    const more = sink.push(row);
    row = [];
    return more ? true : "too_many";
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      if (!endField()) return { ok: false, error: "unreadable" };
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      const ended = endRow();
      if (ended === false) return { ok: false, error: "unreadable" };
      if (ended === "too_many") return sink.finish();
    } else field += char;
    if (field.length > MAX_FIELD_LENGTH)
      return { ok: false, error: "unreadable" };
  }

  // An unclosed quote at the end: the file is cut or malformed.
  if (quoted) return { ok: false, error: "unreadable" };
  if (field !== "" || row.length > 0) {
    const ended = endRow();
    if (ended === false) return { ok: false, error: "unreadable" };
  }
  return sink.finish();
}
