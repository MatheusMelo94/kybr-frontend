// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

// SheetJS's read(), wrapped so a test can prove the guard ran first.
vi.mock("xlsx", async (original) => {
  const sheetjs = await original<typeof import("xlsx")>();
  return { ...sheetjs, read: vi.fn(sheetjs.read) };
});

import { analyzeRows } from "@/features/panel-lote/parser/columns";
import { readCsv } from "@/features/panel-lote/parser/csv";
import { readWorkbook } from "@/features/panel-lote/parser/sheet";
import * as guard from "@/features/panel-lote/parser/zip-guard";
import { AC16, cnpjWithRoot } from "@/tests/fixtures/factories/panel";

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(FILES, name)));

async function rows(name: string, format: "xlsx" | "xls"): Promise<string[][]> {
  const result = await readWorkbook(fixture(name), format);
  if (!result.ok) throw new Error(`expected rows, got ${result.error}`);
  return result.rows;
}

function csvRows(): string[][] {
  const result = readCsv(fixture("ac16.csv"));
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

/** An in-memory workbook, compressed like Excel's (C7 ratio regressions). */
function workbook(
  aoa: unknown[][],
  bookType: "xlsx" | "biff8" = "xlsx",
): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Dados");
  return new Uint8Array(
    XLSX.write(wb, { type: "array", bookType, compression: true }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readWorkbook: the AC 16 set (AC 16, ADR-0012 item 4)", () => {
  it.each([
    ["ac16.xlsx", "xlsx"],
    ["ac16.xls", "xls"],
  ] as const)(
    "%s gives the same analysis and payload as the CSV",
    async (name, format) => {
      const sheet = await rows(name, format);
      const csv = csvRows();
      const fromSheet = analyzeRows(sheet);
      const fromCsv = analyzeRows(csv);
      if (!fromSheet.ok || !fromCsv.ok) throw new Error("analysis failed");
      expect(fromSheet.analysis.stats[0]).toEqual({
        valid: 184,
        duplicates: 4,
        invalid: 2,
      });
      expect(fromSheet.analysis.stats).toEqual(fromCsv.analysis.stats);
      expect(sheet).toHaveLength(csv.length);
    },
  );

  it("a numeric 13-digit CNPJ cell comes back left-padded to 14", async () => {
    const sheet = await rows("ac16.xlsx", "xlsx");
    expect(sheet[2]?.[0]).toBe(AC16.linhas[1]?.cnpj);
    expect(AC16.linhas[1]?.cnpj).toMatch(/^0\d{13}$/);
  });

  it("a numeric CNPJ shown in scientific format reads its value", async () => {
    expect((await rows("cientifico.xlsx", "xlsx"))[1]?.[0]).toBe(
      AC16.linhas[1]?.cnpj,
    );
  });

  it("a formula yields its cached value and is never evaluated; one without a value is empty", async () => {
    const sheet = await rows("formulas.xlsx", "xlsx");
    expect(sheet[2]?.[0]).toBe("12ABC34501DE35");
    expect(sheet[2]?.[1] ?? "").toBe("");
  });

  it("reads only the first visible sheet", async () => {
    const sheet = await rows("aba-oculta.xlsx", "xlsx");
    expect(sheet[0]).toEqual(["CNPJ", "Responsável", "ID na plataforma"]);
    expect(sheet.flat()).not.toContain("isto não é lido");
  });
});

describe("readWorkbook: refusals", () => {
  it("corrupt.xlsx (a truncated zip) → unreadable", async () => {
    expect(await readWorkbook(fixture("corrupt.xlsx"), "xlsx")).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("zip-bomb.xlsx → unreadable BEFORE SheetJS is called", async () => {
    vi.mocked(XLSX.read).mockClear();
    const result = await readWorkbook(fixture("zip-bomb.xlsx"), "xlsx");
    expect(result).toEqual({ ok: false, error: "unreadable" });
    expect(XLSX.read).not.toHaveBeenCalled();
    await readWorkbook(fixture("ac16.xlsx"), "xlsx");
    expect(XLSX.read).toHaveBeenCalledTimes(1);
  });

  it("macro.xlsx → type", async () => {
    expect(await readWorkbook(fixture("macro.xlsx"), "xlsx")).toEqual({
      ok: false,
      error: "type",
    });
  });

  it("BIFF5 (needs codepage tables) → unreadable", async () => {
    expect(await readWorkbook(fixture("biff5.xls"), "xls")).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("garbage named .xls → unreadable", async () => {
    expect(await readWorkbook(new Uint8Array(512), "xls")).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("Amendment 3: data past the 10,001-row read window is not read (never a range refusal)", async () => {
    const aoa = [["CNPJ"], ...Array.from({ length: 10_001 }, () => [""])];
    aoa.push([cnpjWithRoot("123456780001")]);
    expect(await readWorkbook(workbook(aoa), "xlsx")).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("header text never becomes an object key (C6)", async () => {
    const headers = [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "hasOwnProperty",
    ];
    const result = await readWorkbook(
      workbook([headers, [cnpjWithRoot("123456780001"), "b", "c", "d", "e"]]),
      "xlsx",
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.rows[0]).toEqual(headers);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("C7 v1.1 regressions: legitimate big sheets parse (Amendment 2)", () => {
  it("10,001 × 50 repetitive cells: the guard passes it, and it reads as too_many rows only", async () => {
    const row = Array.from({ length: 50 }, (_, c) =>
      c === 0 ? cnpjWithRoot("123456780001") : "Loja Exemplo",
    );
    const bytes = workbook([
      Array.from({ length: 50 }, (_, c) => (c === 0 ? "CNPJ" : `Coluna ${c}`)),
      ...Array.from({ length: 10_000 }, () => row),
    ]);
    expect(await guard.zipGuard(bytes)).toEqual({ ok: true });
    // 10,001 physical rows (header + 10,000) is within the read; the data rows are over 5,000.
    expect(await readWorkbook(bytes, "xlsx")).toEqual({
      ok: false,
      error: "too_many",
    });
  }, 60_000);

  it("5,000 × 50 ERP-style rows parse", async () => {
    const header = [
      "CNPJ",
      "Responsável",
      "ID na plataforma",
      ...Array.from({ length: 47 }, (_, c) => `Campo ${c}`),
    ];
    const data = Array.from({ length: 5000 }, (_, r) => [
      cnpjWithRoot(`6${String(r).padStart(7, "0")}0001`),
      "Pessoa Exemplo",
      `erp-${r}`,
      ...Array.from({ length: 47 }, (_, c) =>
        c % 5 === 0 ? r * 7 + c : `valor ${c % 9}`,
      ),
    ]);
    const bytes = workbook([header, ...data]);
    expect(await guard.zipGuard(bytes)).toEqual({ ok: true });
    const result = await readWorkbook(bytes, "xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeRows(result.rows);
    expect(analysis.ok && analysis.analysis.stats[0]).toEqual({
      valid: 5000,
      duplicates: 0,
      invalid: 0,
    });
  }, 60_000);
});

/** n data rows under a CNPJ header, with distinct valid CNPJs. */
function dataRows(n: number): string[][] {
  return Array.from({ length: n }, (_, r) => [
    cnpjWithRoot(`7${String(r).padStart(7, "0")}0001`),
    "Pessoa Exemplo",
  ]);
}

/** A workbook from a sheet the test shapes (its range, stray formatted cells). */
function workbookFrom(sheet: XLSX.WorkSheet): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Dados");
  return new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }),
  );
}

describe("ADR-0012 Amendment 3 (QA-M5-001): the row limit counts non-blank rows", () => {
  it("190 rows with formatting down to row 12,000 → a preview of 190", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["CNPJ", "Responsável"],
      ...dataRows(190),
    ]);
    // Formatted empty cells far below the data, as Excel leaves them.
    for (const ref of ["A5000", "B9000", "A12000"])
      sheet[ref] = { t: "s", v: "" };
    sheet["!ref"] = "A1:C12000";
    const result = await readWorkbook(workbookFrom(sheet), "xlsx");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(191);
  });

  it("a stale dimension A1:C20000 → a preview", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["CNPJ", "Responsável"],
      ...dataRows(190),
    ]);
    sheet["!ref"] = "A1:C20000";
    const result = await readWorkbook(workbookFrom(sheet), "xlsx");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(191);
  });

  it.each(["formatado-ate-12000.xlsx", "dimensao-antiga.xlsx"])(
    "the committed fixture %s previews its 190 rows",
    async (name) => {
      expect(await rows(name, "xlsx")).toHaveLength(191);
    },
  );

  it("5,001 non-blank data rows → too_many", async () => {
    expect(
      await readWorkbook(
        workbook([["CNPJ", "Responsável"], ...dataRows(5001)]),
        "xlsx",
      ),
    ).toEqual({ ok: false, error: "too_many" });
  }, 60_000);

  it("5,000 non-blank rows spread over 10,001 physical rows → a preview of 5,000", async () => {
    const spread = dataRows(5000).flatMap((row) => [row, ["", ""]]);
    const aoa = [["CNPJ", "Responsável"], ...spread];
    expect(aoa).toHaveLength(10_001);
    const result = await readWorkbook(workbook(aoa), "xlsx");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(5001);
  }, 60_000);
});

