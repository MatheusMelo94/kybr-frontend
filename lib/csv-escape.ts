// The batch CSV downloads' defence in depth (threat model P08, CR-P8;
// Security C9): the backend escapes its CSV, and the download handlers parse
// it and escape it again. Pure, no I/O. Idempotent with the backend: a cell
// it already prefixed starts with ' and is left alone, so a well-escaped
// file comes out byte for byte.

const BOM = "﻿";
const QUOTE = '"';

/** A cell a spreadsheet could read as a formula gets a leading '. */
export function escapeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * RFC 4180 with `delimiter`, strictly: quoted or bare fields, "" inside
 * quotes, CRLF or LF between rows, an optional BOM and final newline. Throws
 * on anything it couldn't write back the same way: an unterminated quote, a
 * quote in a bare field, text after a closing quote, a lone CR, rows of
 * different widths, or no rows at all.
 */
export function parseCsv(text: string, delimiter = ";"): string[][] {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  if (body === "") throw new Error("CSV_EMPTY");
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;

  const endRow = (): void => {
    rows.push(row);
    row = [];
  };

  for (;;) {
    let field = "";
    if (body[i] === QUOTE) {
      i += 1;
      for (;;) {
        if (i >= body.length) throw new Error("CSV_UNTERMINATED_QUOTE");
        if (body[i] === QUOTE) {
          if (body[i + 1] === QUOTE) {
            field += QUOTE;
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        field += body[i];
        i += 1;
      }
    } else {
      while (
        i < body.length &&
        body[i] !== delimiter &&
        body[i] !== "\r" &&
        body[i] !== "\n"
      ) {
        if (body[i] === QUOTE) throw new Error("CSV_QUOTE_IN_BARE_FIELD");
        field += body[i];
        i += 1;
      }
    }
    row.push(field);

    if (i >= body.length) {
      endRow();
      break;
    }
    const next = body[i];
    if (next === delimiter) {
      i += 1;
      continue;
    }
    if (next === "\r" && body[i + 1] === "\n") i += 2;
    else if (next === "\n") i += 1;
    else throw new Error("CSV_UNEXPECTED_CHARACTER");
    endRow();
    if (i >= body.length) break;
  }

  const width = rows[0]?.length ?? 0;
  if (rows.some((cells) => cells.length !== width))
    throw new Error("CSV_IRREGULAR_ROWS");
  return rows;
}

/** BOM, every field quoted (quotes doubled), ';' between fields, CRLF after every row. */
export function writeCsv(rows: string[][]): string {
  const quote = (value: string): string =>
    `${QUOTE}${value.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`;
  return `${BOM}${rows.map((cells) => `${cells.map(quote).join(";")}\r\n`).join("")}`;
}

/**
 * The backend's CSV, every cell escaped again. Throws on a malformed file.
 * `prepare` sees each body cell with its column's header first (M8C-01).
 */
export function reEscapeCsv(
  text: string,
  prepare: (cell: string, column: string) => string = (cell) => cell,
): string {
  const [header = [], ...rows] = parseCsv(text);
  return writeCsv([
    header.map(escapeCell),
    ...rows.map((cells) =>
      cells.map((cell, i) => escapeCell(prepare(cell, header[i] ?? ""))),
    ),
  ]);
}
