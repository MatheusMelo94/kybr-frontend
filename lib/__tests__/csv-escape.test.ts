import { describe, expect, it } from "vitest";

import {
  escapeCell,
  parseCsv,
  reEscapeCsv,
  writeCsv,
} from "@/lib/csv-escape";

const BOM = "﻿";

describe("escapeCell (P08, CR-P8)", () => {
  it.each([
    ["=HYPERLINK(\"http://x\")", "'=HYPERLINK(\"http://x\")"],
    ["+5511999", "'+5511999"],
    ["-2", "'-2"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", "'\rcmd"],
    // ext_id: printable ASCII, formula characters allowed (C9).
    ["=ext-42", "'=ext-42"],
    ["@ext_7", "'@ext_7"],
    // Already escaped by the backend: unchanged (idempotent).
    ["'=x", "'=x"],
    ["'+1", "'+1"],
    // Nothing to escape.
    ["11.222.333/0001-81", "11.222.333/0001-81"],
    ["Comércio Exemplo Ltda", "Comércio Exemplo Ltda"],
    ["a=b", "a=b"],
    ["", ""],
  ])("%j → %j", (input, output) => {
    expect(escapeCell(input)).toBe(output);
  });

  it("running it twice equals running it once", () => {
    for (const value of ["=1", "+1", "-1", "@1", "\t1", "\r1", "'=1", "x"])
      expect(escapeCell(escapeCell(value))).toBe(escapeCell(value));
  });
});

describe("parseCsv (RFC 4180, ';')", () => {
  it("reads quoted and bare fields, doubled quotes, ; and newlines inside quotes, CRLF or LF, the BOM", () => {
    expect(
      parseCsv(`${BOM}"CNPJ";"Nome"\r\n"1";"Diz ""oi""; tchau"\r\n2;"duas\r\nlinhas"\n`),
    ).toEqual([
      ["CNPJ", "Nome"],
      ["1", 'Diz "oi"; tchau'],
      ["2", "duas\r\nlinhas"],
    ]);
  });

  it("an empty last field and no final newline", () => {
    expect(parseCsv('"a";""\r\n"b";')).toEqual([
      ["a", ""],
      ["b", ""],
    ]);
  });

  it.each([
    ["an unterminated quote", '"CNPJ";"Situação"\r\n"1";"aberta\r\n'],
    ["a comma separator", '"CNPJ","Situação"\r\n"1","Tudo certo"\r\n'],
    ["rows of different widths", '"CNPJ";"Situação"\r\n"1"\r\n'],
    ["a quote inside a bare field", 'CNPJ;Na"me\r\n'],
    ["a lone CR outside quotes", '"a";"b"\r"c";"d"\r\n'],
    ["an empty body", ""],
    ["a BOM alone", BOM],
  ])("refuses %s", (_, text) => {
    expect(() => parseCsv(text)).toThrow();
  });
});

describe("writeCsv", () => {
  it("BOM, every field quoted, quotes doubled, ';', CRLF after every row", () => {
    expect(
      writeCsv([
        ["CNPJ", "Nome"],
        ["1", 'Diz "oi"'],
      ]),
    ).toBe(`${BOM}"CNPJ";"Nome"\r\n"1";"Diz ""oi"""\r\n`);
  });
});

describe("reEscapeCsv", () => {
  const backend = `${BOM}"CNPJ";"Responsável";"ID na plataforma"\r\n"11.222.333/0001-81";"'=HYPERLINK(""x"")";"'@ext"\r\n`;

  it("an already-escaped backend file comes out byte for byte", () => {
    expect(reEscapeCsv(backend)).toBe(backend);
  });

  it("an unescaped backend file (PB8) gets the ' prefix", () => {
    const raw = `${BOM}"CNPJ";"Responsável"\r\n"11.222.333/0001-81";"=HYPERLINK(""x"")"\r\n`;
    expect(reEscapeCsv(raw)).toBe(
      `${BOM}"CNPJ";"Responsável"\r\n"11.222.333/0001-81";"'=HYPERLINK(""x"")"\r\n`,
    );
  });

  it("is idempotent", () => {
    const raw = `${BOM}"a";"b"\r\n"=1";"-2"\r\n"+3";"@4"\r\n`;
    expect(reEscapeCsv(reEscapeCsv(raw))).toBe(reEscapeCsv(raw));
  });

  it("refuses a malformed file (no partial output)", () => {
    expect(() => reEscapeCsv('"a";"b\r\n')).toThrow();
  });
});
