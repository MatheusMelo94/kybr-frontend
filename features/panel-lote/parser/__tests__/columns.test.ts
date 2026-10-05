// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeRows,
  buildPayload,
} from "@/features/panel-lote/parser/columns";
import { readCsv } from "@/features/panel-lote/parser/csv";
import {
  AC16,
  cnpjWithRoot,
  maskedCnpj,
} from "@/tests/fixtures/factories/panel";

const FILES = join(process.cwd(), "tests/fixtures/files/lote");

function csvRows(name: string): string[][] {
  const result = readCsv(readFileSync(join(FILES, name)));
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

function analyzed(rows: string[][]) {
  const result = analyzeRows(rows);
  if (!result.ok) throw new Error(result.error);
  return result.analysis;
}

const A = "11222333000181";
const B = "12ABC34501DE35";
const C = cnpjWithRoot("114447770001");

describe("analyzeRows: the AC 16 set (AC 16)", () => {
  const analysis = analyzed(csvRows("ac16.csv"));

  it("reads the header and finds the CNPJ column by name", () => {
    expect(analysis.headers).toEqual([
      "CNPJ",
      "Responsável",
      "ID na plataforma",
    ]);
    expect(analysis.hasHeader).toBe(true);
    expect(analysis.detected).toEqual({
      cnpj: 0,
      responsavel: 1,
      extId: 2,
    });
    expect(analysis.dataRows).toBe(190);
  });

  it("184 valid, 4 duplicates (every repeat after the first), 2 invalid", () => {
    expect(analysis.stats[0]).toEqual({
      valid: 184,
      duplicates: 4,
      invalid: 2,
    });
  });

  it("the preview is the first 5 data rows", () => {
    expect(analysis.preview).toHaveLength(5);
    expect(analysis.preview[0]?.[0]).toBe(AC16.rows[0]?.cnpj);
  });

  it("every column has its stats, for the Coluna do CNPJ select", () => {
    expect(analysis.stats).toHaveLength(3);
    expect(analysis.stats[1]).toEqual({
      valid: 0,
      duplicates: 0,
      invalid: 190,
    });
  });
});

describe("analyzeRows: the header rule", () => {
  it("a first row whose CNPJ cell validates is data; columns are named by letter", () => {
    const analysis = analyzed(csvRows("sem-cabecalho.csv"));
    expect(analysis.hasHeader).toBe(false);
    expect(analysis.headers).toEqual(["A", "B", "C"]);
    expect(analysis.detected).toEqual({ cnpj: 0 });
    expect(analysis.dataRows).toBe(20);
  });

  it("letters go past Z (AA, AB…)", () => {
    const row = [A, ...Array.from({ length: 27 }, () => "x")];
    expect(analyzed([row, row]).headers.slice(25, 28)).toEqual([
      "Z",
      "AA",
      "AB",
    ]);
  });

  it("a header-only sheet is empty", () => {
    expect(analyzeRows([["CNPJ", "Nome"]])).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("more than 5,000 data rows → too_many; 5,000 with a header is fine", () => {
    const rows = (n: number) => [
      ["CNPJ"],
      ...Array.from({ length: n }, () => [A]),
    ];
    expect(analyzeRows(rows(5001))).toEqual({ ok: false, error: "too_many" });
    expect(analyzeRows(rows(5000)).ok).toBe(true);
    const headerless = Array.from({ length: 5001 }, () => [A]);
    expect(analyzeRows(headerless)).toEqual({ ok: false, error: "too_many" });
  });
});

describe("analyzeRows: the CNPJ column (spec O-09)", () => {
  it.each([
    ["CNPJ"],
    ["cnpj do vendedor"],
    ["  C N P J  "],
    ["CNPJ/CPF"],
    ["Número do CNPJ"],
  ])("a header with the word cnpj wins: %j", (header) => {
    const rows = [
      ["Nome", header],
      ["Maria", "não é cnpj"],
      ["João", "x"],
    ];
    expect(analyzed(rows).detected.cnpj).toBe(1);
  });

  it("else the first column where ≥ 80 % of the non-empty values are CNPJ-shaped", () => {
    const shaped = "11222333000100"; // shaped, but a bad check digit
    // Column 1: 4 of 5 non-empty values are shaped (80 %); the empty one doesn't count.
    const rows = [
      ["Nome", "Documento", "Outro"],
      ["a", A, A],
      ["b", shaped, A],
      ["c", B, A],
      ["d", "", A],
      ["e", A, A],
      ["f", "não", A],
    ];
    expect(analyzed(rows).detected.cnpj).toBe(1);
    // 3 of 5 (60 %): column 2 is the first that qualifies.
    rows[1] = ["a", "talvez", A];
    expect(analyzed(rows).detected.cnpj).toBe(2);
  });

  it("no CNPJ column → none (nocolumn), with stats per column still there", () => {
    const analysis = analyzed(csvRows("sem-coluna-cnpj.csv"));
    expect(analysis.detected.cnpj).toBeUndefined();
    expect(analysis.stats).toHaveLength(3);
  });
});

describe("analyzeRows: optional columns (by header only)", () => {
  it.each([
    ["Responsável", "ID na plataforma"],
    ["responsavel", "id"],
    ["Nome do Responsável", "ext_id"],
    ["NOME DO RESPONSAVEL", "ID externo"],
  ])("%j and %j", (responsavel, extId) => {
    const rows = [
      ["CNPJ", responsavel, extId],
      [A, "Maria", "7"],
    ];
    expect(analyzed(rows).detected).toEqual({
      cnpj: 0,
      responsavel: 1,
      extId: 2,
    });
  });

  it("other headers aren't optional columns", () => {
    expect(
      analyzed([
        ["CNPJ", "Nome", "Código"],
        [A, "Maria", "7"],
      ]).detected,
    ).toEqual({
      cnpj: 0,
    });
  });
});

describe("analyzeRows: header text never becomes an object key (Security C6)", () => {
  it("__proto__, constructor, prototype, toString, hasOwnProperty make a normal preview", () => {
    const headers = [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "hasOwnProperty",
    ];
    const analysis = analyzed([
      headers,
      [A, "b", "c", "d", "e"],
      [B, "b", "c", "d", "e"],
    ]);
    expect(analysis.headers).toEqual(headers);
    expect(analysis.detected).toEqual({ cnpj: 0 });
    expect(analysis.stats[0]).toEqual({ valid: 2, duplicates: 0, invalid: 0 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("buildPayload (ADR-0012 items 2 and 8)", () => {
  it("the AC 16 set: the 184, first occurrence wins, file order, wire format", () => {
    const rows = csvRows("ac16.csv");
    const analysis = analyzed(rows);
    expect(buildPayload(rows, analysis, 0)).toEqual(AC16.linhas);
  });

  it("drops an optional cell over its cap or off its charset; the row stays", () => {
    const rows = [
      ["CNPJ", "Responsável", "ID"],
      [A, "  Maria   Exemplo ", " id-1 "],
      [B, "=1+1", "x".repeat(65)],
      [maskedCnpj(C), "a".repeat(121), "ação"],
      [C, "Outra Pessoa", "dup"],
    ];
    expect(buildPayload(rows, analyzed(rows), 0)).toEqual([
      { cnpj: A, responsavel: "Maria Exemplo", ext_id: "id-1" },
      { cnpj: B },
      { cnpj: C },
    ]);
  });

  it("uses another column when Renata picks one", () => {
    const rows = [
      ["Nome", "Doc"],
      ["Maria", A],
      ["João", B],
    ];
    expect(buildPayload(rows, analyzed(rows), 1)).toEqual([
      { cnpj: A },
      { cnpj: B },
    ]);
  });

  it("a headerless sheet has no optional columns", () => {
    const rows = [
      [A, "Maria Exemplo", "7"],
      [B, "João Exemplo", "8"],
    ];
    expect(buildPayload(rows, analyzed(rows), 0)).toEqual([
      { cnpj: A },
      { cnpj: B },
    ]);
  });
});
