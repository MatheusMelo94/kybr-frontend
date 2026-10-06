// The cheap checks before any parsing (ADR-0012 item 2, P09): the size, then
// the extension and the first bytes, which must agree. They run on the main
// thread on the File's metadata and first 8 KB, and again in the worker.

import { MAX_FILE_BYTES } from "@/features/panel-lote/validation";

/** How much of the file the checks read: CSV must have no NUL byte in it. */
export const SNIFF_BYTES = 8 * 1024;

export type SheetFormat = "csv" | "xlsx" | "xls";
export type SniffResult =
  | { ok: true; format: SheetFormat }
  | { ok: false; error: "type" | "too_large" | "unreadable" };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
// Binary formats that can open without a NUL in their first bytes.
const BINARY = [
  ZIP,
  CFB,
  [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF8
];

function startsWith(head: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => head[index] === byte);
}

// UTF-16 byte-order marks (QA Q5: a CSV, just not one we read).
const UTF16 = [
  [0xff, 0xfe],
  [0xfe, 0xff],
];

function looksLikeText(head: Uint8Array): boolean {
  return (
    !BINARY.some((magic) => startsWith(head, magic)) &&
    !head.subarray(0, SNIFF_BYTES).includes(0)
  );
}

/**
 * `type` for anything but .csv / .xlsx / .xls whose bytes agree with the name
 * (.xlsm, .xlsb, .ods, a PDF, an image, a zip called .csv…); `too_large` over
 * 10 MB (shown as lote.error.unreadable: the spec has no size copy).
 * QA Q5: a password-protected XLSX (OOXML encryption wraps it in a CFB) and
 * a UTF-16 CSV are what they claim to be, just unreadable: `unreadable`.
 */
export function sniffFile(file: {
  name: string;
  size: number;
  head: Uint8Array;
}): SniffResult {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "too_large" };
  const extension = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (
    (extension === "xlsx" && startsWith(file.head, CFB)) ||
    (extension === "csv" && UTF16.some((bom) => startsWith(file.head, bom)))
  )
    return { ok: false, error: "unreadable" };
  const agrees =
    (extension === "xlsx" && startsWith(file.head, ZIP)) ||
    (extension === "xls" && startsWith(file.head, CFB)) ||
    (extension === "csv" && looksLikeText(file.head));
  return agrees
    ? { ok: true, format: extension as SheetFormat }
    : { ok: false, error: "type" };
}
