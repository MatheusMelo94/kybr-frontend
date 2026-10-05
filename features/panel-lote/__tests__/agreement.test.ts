// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isValidLinha } from "@/features/panel-lote/validation";
import { linhaSchema, startBatchSchema } from "@/features/panel-lote/schemas";
import { cnpjWithRoot } from "@/tests/fixtures/factories/panel";

// ADR-0010 Addendum 1 rule 8: the worker's row checks (plain functions) and
// the action's zod accept and reject the same rows.

const A = "11222333000181";
const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";

const TABLE: [string, unknown][] = [
  ["numeric", { cnpj: A }],
  ["alphanumeric", { cnpj: "12ABC34501DE35" }],
  [
    "with both optional fields",
    { cnpj: A, responsavel: "Maria Exemplo", ext_id: "id-1" },
  ],
  ["a 120-letter name", { cnpj: A, responsavel: "a".repeat(120) }],
  ["a 64-character ext_id", { cnpj: A, ext_id: "x".repeat(64) }],
  ["masked", { cnpj: "11.222.333/0001-81" }],
  ["lowercase", { cnpj: "12abc34501de35" }],
  ["a bad check digit", { cnpj: "11222333000100" }],
  ["all the same digit", { cnpj: "11111111111111" }],
  ["letters in the check digits", { cnpj: "12ABC34501DEAB" }],
  ["empty", { cnpj: "" }],
  ["a 121-letter name", { cnpj: A, responsavel: "a".repeat(121) }],
  ["a formula as the name", { cnpj: A, responsavel: "=1+1" }],
  ["an empty name", { cnpj: A, responsavel: "" }],
  ["a 65-character ext_id", { cnpj: A, ext_id: "x".repeat(65) }],
  ["a non-ASCII ext_id", { cnpj: A, ext_id: "ação" }],
  ["an extra field", { cnpj: A, nota: "x" }],
  ["a number as the CNPJ", { cnpj: 11222333000181 }],
  ["no CNPJ", { responsavel: "Maria" }],
];

describe("row checks agree (worker vs server zod)", () => {
  it.each(TABLE)("%s", (_, linha) => {
    expect(isValidLinha(linha)).toBe(linhaSchema.safeParse(linha).success);
  });

  it("the table has both outcomes", () => {
    const outcomes = new Set(TABLE.map(([, linha]) => isValidLinha(linha)));
    expect(outcomes).toEqual(new Set([true, false]));
  });
});

describe("startBatchSchema (the action's input, ADR-0012 item 8)", () => {
  it("1–5,000 unique rows and a uuid key; strict", () => {
    expect(
      startBatchSchema.safeParse({ idempotencyKey: KEY, linhas: [{ cnpj: A }] })
        .success,
    ).toBe(true);
    for (const input of [
      { idempotencyKey: KEY, linhas: [] },
      { idempotencyKey: KEY, linhas: [{ cnpj: A }, { cnpj: A }] },
      { idempotencyKey: "nao-uuid", linhas: [{ cnpj: A }] },
      { idempotencyKey: KEY, linhas: [{ cnpj: A }], extra: 1 },
      {
        idempotencyKey: KEY,
        linhas: Array.from({ length: 5001 }, (_, i) => ({
          cnpj: cnpjWithRoot(`7${String(i).padStart(7, "0")}0001`),
        })),
      },
    ])
      expect(startBatchSchema.safeParse(input).success).toBe(false);
  });

  it("5,000 rows at the caps fit the action's 2.5 MB limit, even with 3-byte letters (Security C2)", () => {
    const linhas = Array.from({ length: 5000 }, (_, i) => ({
      cnpj: cnpjWithRoot(`7${String(i).padStart(7, "0")}0001`),
      // U+4E2D is a letter (Lo) and 3 bytes in UTF-8: the worst case.
      responsavel: "中".repeat(120),
      ext_id: "x".repeat(64),
    }));
    const input = { idempotencyKey: KEY, linhas };
    expect(startBatchSchema.safeParse(input).success).toBe(true);
    const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
    expect(bytes).toBeGreaterThan(2 * 1024 * 1024); // why 2 MB wasn't enough
    expect(bytes).toBeLessThan(2.5 * 1024 * 1024);
  });
});
