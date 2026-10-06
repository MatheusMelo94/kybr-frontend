// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createParserHandler } from "@/features/panel-lote/parser/handler";
import type { WorkerMessage } from "@/features/panel-lote/parser/protocol";
import { AC16 } from "@/tests/fixtures/factories/panel";

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
// A name a test can look for: it must never cross back (C8).
const fileOf = (
  fixture: string,
  name = `segredo-vendedores.${fixture.split(".").pop()}`,
) => new File([readFileSync(join(FILES, fixture))], name);

let posted: WorkerMessage[];
let handle: (message: unknown) => Promise<void>;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  posted = [];
  handle = createParserHandler((message) => posted.push(message));
  consoleSpies = (["log", "warn", "error", "info", "debug"] as const).map(
    (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("the parser worker's handler (T75, ADR-0012 item 1, Security C8)", () => {
  it("parse → a preview: headers, 5 rows, per-column stats and the detected columns; nothing else", async () => {
    await handle({ kind: "parse", file: fileOf("ac16.csv") });
    expect(posted).toHaveLength(1);
    const [message] = posted;
    expect(Object.keys(message ?? {}).sort()).toEqual([
      "detected",
      "headers",
      "kind",
      "rows",
      "stats",
    ]);
    expect(message).toMatchObject({
      kind: "preview",
      headers: ["CNPJ", "Responsável", "ID na plataforma"],
      detected: { cnpj: 0, responsavel: 1, extId: 2 },
    });
    if (message?.kind !== "preview") throw new Error("no preview");
    expect(message.rows).toHaveLength(5);
    expect(message.stats[0]).toEqual({ valid: 184, duplicates: 4, invalid: 2 });
    expect(JSON.stringify(posted)).not.toContain("segredo");
  });

  it.each([["ac16.xlsx"], ["ac16.xls"]])(
    "%s gives the same preview counts",
    async (fixture) => {
      await handle({ kind: "parse", file: fileOf(fixture) });
      expect(posted[0]).toMatchObject({ kind: "preview" });
      if (posted[0]?.kind === "preview")
        expect(posted[0].stats[0]).toEqual({
          valid: 184,
          duplicates: 4,
          invalid: 2,
        });
    },
  );

  it.each([
    ["documento.pdf", "type"],
    ["vazio.csv", "empty"],
    ["so-cabecalho.csv", "empty"],
    ["5001-linhas.csv", "too_many"],
    ["corrupt.xlsx", "unreadable"],
    ["zip-bomb.xlsx", "unreadable"],
    ["macro.xlsx", "type"],
    ["utf16le.csv", "unreadable"],
    ["protegido.xlsx", "unreadable"],
  ])("%s → error %s (only the code crosses)", async (fixture, error) => {
    await handle({ kind: "parse", file: fileOf(fixture) });
    expect(posted).toEqual([{ kind: "error", error }]);
  });

  it("over 10 MB → unreadable, before it's read", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.csv");
    await handle({ kind: "parse", file: big });
    expect(posted).toEqual([{ kind: "error", error: "unreadable" }]);
  });

  it("cuts each preview cell to 80 characters", async () => {
    const text = `CNPJ;Nome\n${AC16.linhas[0]?.cnpj};${"a".repeat(200)}\n`;
    await handle({ kind: "parse", file: new File([text], "x.csv") });
    if (posted[0]?.kind !== "preview") throw new Error("no preview");
    expect(posted[0].rows[0]?.[1]).toHaveLength(80);
  });

  it("build(column) → the payload, once; then the sheet is dropped", async () => {
    await handle({ kind: "parse", file: fileOf("ac16.csv") });
    await handle({ kind: "build", column: 0 });
    expect(posted[1]).toEqual({ kind: "payload", linhas: AC16.linhas });
    await handle({ kind: "build", column: 0 });
    expect(posted).toHaveLength(2);
  });

  it.each([
    ["no file", { kind: "parse" }],
    ["a string as the file", { kind: "parse", file: "x.csv" }],
    ["an unknown kind", { kind: "read", file: "x" }],
    ["a string", "parse"],
    ["null", null],
  ])("ignores %s", async (_, message) => {
    await handle(message);
    expect(posted).toEqual([]);
  });

  it.each([
    ["a column past the last", 3],
    ["a negative column", -1],
    ["a fractional column", 0.5],
    ["a string column", "0"],
  ])("build ignores %s", async (_, column) => {
    await handle({ kind: "parse", file: fileOf("ac16.csv") });
    await handle({ kind: "build", column });
    expect(posted).toHaveLength(1);
  });

  it("build before any parse is ignored", async () => {
    await handle({ kind: "build", column: 0 });
    expect(posted).toEqual([]);
  });

  it("C6: hostile headers never pollute a prototype", async () => {
    const text = `__proto__;constructor;prototype\n${AC16.linhas[0]?.cnpj};b;c\n`;
    await handle({ kind: "parse", file: new File([text], "x.csv") });
    expect(posted[0]).toMatchObject({ kind: "preview" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
