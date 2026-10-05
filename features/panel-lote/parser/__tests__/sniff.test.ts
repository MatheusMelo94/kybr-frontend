// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SNIFF_BYTES, sniffFile } from "@/features/panel-lote/parser/sniff";

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const TEXT = [...new TextEncoder().encode("CNPJ;Responsável\r\n")];

function file(
  name: string,
  head: readonly number[] | Uint8Array,
  size = head.length,
) {
  return { name, size, head: Uint8Array.from(head) };
}

describe("sniffFile (ADR-0012 item 2, AC 15 type)", () => {
  it("reads 8 KB of the file at most", () => {
    expect(SNIFF_BYTES).toBe(8 * 1024);
  });

  it.each([
    ["lista.csv", TEXT, "csv"],
    ["LISTA.CSV", TEXT, "csv"],
    ["lista.xlsx", ZIP, "xlsx"],
    ["Lista.XLSX", ZIP, "xlsx"],
    ["lista.xls", CFB, "xls"],
    ["vazio.csv", [], "csv"],
  ] as const)("%s → ok (%s)", (name, head, format) => {
    expect(sniffFile(file(name, head))).toEqual({ ok: true, format });
  });

  it("the AC 16 CSV fixture is a CSV", () => {
    const bytes = readFileSync(join(FILES, "ac16.csv"));
    expect(
      sniffFile(file("ac16.csv", bytes.subarray(0, SNIFF_BYTES), bytes.length)),
    ).toEqual({ ok: true, format: "csv" });
  });

  it.each([
    [
      "a PDF",
      "documento.pdf",
      [...readFileSync(join(FILES, "documento.pdf")).subarray(0, 64)],
    ],
    [
      "a PDF renamed .csv",
      "documento.csv",
      [...readFileSync(join(FILES, "documento.pdf")).subarray(0, 64)],
    ],
    ["a PNG", "imagem.png", PNG],
    ["a PNG renamed .xlsx", "imagem.xlsx", PNG],
    ["a macro workbook (.xlsm)", "lista.xlsm", ZIP],
    ["a binary workbook (.xlsb)", "lista.xlsb", ZIP],
    ["an OpenDocument sheet (.ods)", "lista.ods", ZIP],
    ["a .csv whose bytes are a zip", "lista.csv", ZIP],
    ["a .csv whose bytes are a CFB", "lista.csv", CFB],
    ["a .xlsx whose bytes are text", "lista.xlsx", TEXT],
    ["a .xls whose bytes are a zip", "lista.xls", ZIP],
    ["a text file with a NUL byte", "lista.csv", [0x41, 0x3b, 0x00, 0x42]],
    ["no extension", "lista", TEXT],
    ["a double extension", "lista.csv.exe", TEXT],
  ])("%s → type", (_, name, head) => {
    expect(sniffFile(file(name as string, head as number[]))).toEqual({
      ok: false,
      error: "type",
    });
  });

  it("over 10 MB → too_large, before the bytes are looked at", () => {
    expect(sniffFile(file("lista.csv", TEXT, 10 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      error: "too_large",
    });
    expect(sniffFile(file("lista.csv", TEXT, 10 * 1024 * 1024))).toEqual({
      ok: true,
      format: "csv",
    });
  });

  it("a NUL beyond the first 8 KB isn't looked for", () => {
    const head = new Uint8Array(SNIFF_BYTES + 10).fill(0x41);
    head[SNIFF_BYTES + 5] = 0;
    expect(sniffFile(file("lista.csv", head))).toEqual({
      ok: true,
      format: "csv",
    });
  });

  it.each([
    ["a password-protected XLSX (CFB bytes)", "lista.xlsx", CFB],
    ["a UTF-16LE CSV", "lista.csv", [0xff, 0xfe, 0x43, 0x00, 0x4e, 0x00]],
    ["a UTF-16BE CSV", "lista.csv", [0xfe, 0xff, 0x00, 0x43, 0x00, 0x4e]],
  ])(
    "Q5: %s → unreadable (it is Excel / CSV, just not readable)",
    (_, name, head) => {
      expect(sniffFile(file(name as string, head as number[]))).toEqual({
        ok: false,
        error: "unreadable",
      });
    },
  );
});

describe("QA G2 fixtures", () => {
  it.each(["utf16le.csv", "protegido.xlsx"])("%s → unreadable", (name) => {
    const bytes = readFileSync(join(FILES, name));
    expect(
      sniffFile(file(name, bytes.subarray(0, SNIFF_BYTES), bytes.length)),
    ).toEqual({ ok: false, error: "unreadable" });
  });
});
