// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { zipGuard } from "@/features/panel-lote/parser/zip-guard";

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(FILES, name)));

describe("zipGuard (Security C7 v1.1, ADR-0012 Amendment 2)", () => {
  it.each(["ac16.xlsx", "aba-oculta.xlsx", "formulas.xlsx", "cientifico.xlsx"])(
    "lets a real workbook through: %s",
    async (name) => {
      expect(await zipGuard(fixture(name))).toEqual({ ok: true });
    },
  );

  it.each([
    ["a truncated zip (no end record)", "corrupt.xlsx"],
    ["an entry declaring > 100 MiB", "zip-bomb.xlsx"],
    ["an entry declaring ≥ 1000:1 and ≥ 1 MiB", "zip-razao.xlsx"],
    ["> 150 MiB declared in total (lying sizes)", "zip-tamanho-falso.xlsx"],
    ["entries overlapping each other", "zip-sobreposto.xlsx"],
    ["ZIP64", "zip64.xlsx"],
    ["a multi-disk archive", "zip-multidisco.xlsx"],
    ["an encrypted entry", "zip-criptografado.xlsx"],
    ["duplicate names", "zip-duplicado.xlsx"],
    ["> 2,000 entries", "zip-2001-entradas.xlsx"],
    ["no xl/workbook.xml", "sem-workbook.xlsx"],
  ])("%s → unreadable", async (_, name) => {
    expect(await zipGuard(fixture(name))).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("a macro-enabled workbook (its content type, or vbaProject.bin) → type", async () => {
    expect(await zipGuard(fixture("macro.xlsx"))).toEqual({
      ok: false,
      error: "type",
    });
  });

  it.each([
    ["empty", new Uint8Array()],
    [
      "random bytes",
      Uint8Array.from({ length: 4096 }, (_, i) => (i * 37) % 256),
    ],
    [
      "an end record whose directory points past the end",
      (() => {
        const bytes = new Uint8Array(22);
        new DataView(bytes.buffer).setUint32(0, 0x06054b50, true);
        new DataView(bytes.buffer).setUint16(10, 1, true);
        new DataView(bytes.buffer).setUint32(12, 46, true);
        new DataView(bytes.buffer).setUint32(16, 1000, true);
        return bytes;
      })(),
    ],
  ])("never throws on %s (unreadable)", async (_, bytes) => {
    expect(await zipGuard(bytes)).toEqual({ ok: false, error: "unreadable" });
  });
});
