// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readCsv } from "@/features/panel-lote/parser/csv";
import { AC16 } from "@/tests/fixtures/factories/panel";

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
const fixture = (name: string): Uint8Array => readFileSync(join(FILES, name));
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function rows(bytes: Uint8Array): string[][] {
  const result = readCsv(bytes);
  if (!result.ok) throw new Error(`expected rows, got ${result.error}`);
  return result.rows;
}

const AC16_SHEET = [
  ["CNPJ", "Responsável", "ID na plataforma"],
  ...AC16.rows.map((row) => [row.cnpj, row.responsavel, row.ext_id]),
];

describe("readCsv: the AC 16 fixtures (AC 15, 16)", () => {
  it("UTF-8 with a BOM: every row, in order, the BOM stripped", () => {
    expect(rows(fixture("ac16.csv"))).toEqual(AC16_SHEET);
  });

  it("Windows-1252: Responsável and every name survive", () => {
    expect(rows(fixture("ac16-windows-1252.csv"))).toEqual(AC16_SHEET);
  });

  it("UTF-8 without a BOM", () => {
    expect(rows(utf8("CNPJ;Responsável\r\n11222333000181;João\r\n"))).toEqual([
      ["CNPJ", "Responsável"],
      ["11222333000181", "João"],
    ]);
  });
});

describe("readCsv: delimiters, quoting and line ends (RFC 4180)", () => {
  it.each([
    [";", "a;b;c\n1;2;3\n"],
    [",", "a,b,c\n1,2,3\n"],
    ["tab", "a\tb\tc\n1\t2\t3\n"],
  ])("sniffs %s on the first non-blank line", (_, text) => {
    expect(rows(utf8(`\n\n${text}`))).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("the most frequent delimiter outside quotes wins; a tie goes to ;", () => {
    expect(rows(utf8("x;y,z,w\n1;2,3,4\n"))[0]).toEqual(["x;y", "z", "w"]);
    expect(rows(utf8("a;b,c\n1;2,3\n"))[0]).toEqual(["a", "b,c"]);
    expect(rows(utf8('"a,b,c";d\n1;2\n'))[0]).toEqual(["a,b,c", "d"]);
  });

  it("quoted fields keep delimiters, line breaks and doubled quotes", () => {
    expect(
      rows(
        utf8(
          'CNPJ;Nome\r\n"11.222.333/0001-81";"Loja ""Boa""; Ltda"\r\n"x";"linha 1\r\nlinha 2"\r\n',
        ),
      ),
    ).toEqual([
      ["CNPJ", "Nome"],
      ["11.222.333/0001-81", 'Loja "Boa"; Ltda'],
      ["x", "linha 1\r\nlinha 2"],
    ]);
  });

  it("CRLF, LF, a trailing blank line and blank rows in the middle", () => {
    expect(rows(utf8("a;b\r\n1;2\n\n;\r\n3;4\r\n\r\n"))).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("values are never evaluated", () => {
    expect(
      rows(utf8('CNPJ;Nome\n11222333000181;=HYPERLINK("x")\n'))[1],
    ).toEqual(["11222333000181", '=HYPERLINK("x")']);
  });

  it("an unclosed quote at the end → unreadable", () => {
    expect(readCsv(utf8('CNPJ;Nome\n11222333000181;"aberto\n'))).toEqual({
      ok: false,
      error: "unreadable",
    });
  });
});

describe("readCsv: empty files and the caps (AC 15, Security C6, C7)", () => {
  it.each(["vazio.csv", "so-cabecalho.csv"])("%s → empty", (name) => {
    expect(readCsv(fixture(name))).toEqual({ ok: false, error: "empty" });
  });

  it("only blank lines → empty", () => {
    expect(readCsv(utf8("\r\n;;\r\n\r\n"))).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("a single row with a CNPJ is data, not a header", () => {
    expect(rows(utf8("11222333000181;Maria\n"))).toEqual([
      ["11222333000181", "Maria"],
    ]);
  });

  it("5,000 data rows are ok; 5,001 → too_many", () => {
    expect(rows(fixture("5000-linhas.csv"))).toHaveLength(5001);
    expect(readCsv(fixture("5001-linhas.csv"))).toEqual({
      ok: false,
      error: "too_many",
    });
  });

  it("counts only the first 50 columns", () => {
    const wide = Array.from({ length: 60 }, (_, i) => `c${i}`).join(";");
    const parsed = rows(utf8(`${wide}\n${wide}\n`));
    expect(parsed[0]).toHaveLength(50);
    expect(parsed[0]?.at(-1)).toBe("c49");
  });

  it("a field over 32 KiB → unreadable", () => {
    expect(
      readCsv(utf8(`CNPJ;Nome\nx;${"a".repeat(32 * 1024 + 1)}\n`)),
    ).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(readCsv(utf8(`CNPJ;Nome\nx;${"a".repeat(32 * 1024)}\n`)).ok).toBe(
      true,
    );
  });

  it("a line over 256 fields → unreadable (a 10 MB line of ; never becomes an array)", () => {
    expect(readCsv(utf8(`${";".repeat(256)}\n`))).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(readCsv(utf8(`11222333000181${";".repeat(255)}\n`)).ok).toBe(true);
  });

  it("header text never becomes an object key", () => {
    const parsed = rows(
      utf8(
        "__proto__;constructor;prototype;toString;hasOwnProperty\n1;2;3;4;5\n",
      ),
    );
    expect(parsed[0]).toEqual([
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "hasOwnProperty",
    ]);
    expect(Array.isArray(parsed[0])).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("readCsv: QA G2 fixtures", () => {
  it("UTF-8 with one invalid byte falls back to Windows-1252: every row survives", () => {
    const parsed = rows(fixture("utf8-byte-invalido.csv"));
    // The header, the 5 rows, and the stray byte as a last one-cell row ("ÿ").
    expect(parsed).toHaveLength(7);
    expect(parsed[1]?.[0]).toBe(AC16.rows[0]?.cnpj);
    expect(parsed[6]).toEqual(["ÿ"]);
  });

  it("markup in a cell is just text", () => {
    expect(rows(fixture("marcacao.csv"))[1]?.[1]).toBe("<img src=x onerror=alert(1)>");
  });
});
