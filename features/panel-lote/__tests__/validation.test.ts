// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  EXT_ID_MAX,
  MAX_FILE_BYTES,
  MAX_ROWS,
  RESPONSAVEL_MAX,
  isBatchCursor,
  isBatchId,
  isBatchRowStatus,
  isValidExtId,
  isValidResponsavel,
} from "@/features/panel-lote/validation";
import { BATCH_PROGRESS_INTERVAL_MS } from "@/features/panel-shell/polling";
import { verifySchema } from "@/features/seller-link/schemas";
import { apiPaths } from "@/lib/api/path";

describe("Lote limits (spec J3, contract C4, ADR-0012)", () => {
  it("caps rows, file size and the optional fields", () => {
    expect(MAX_ROWS).toBe(5000);
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(RESPONSAVEL_MAX).toBe(120);
    expect(EXT_ID_MAX).toBe(64);
  });
});

describe("isValidResponsavel (F07 charset, ≤ 120)", () => {
  it.each([
    "Maria Exemplo",
    "João D'Ávila",
    "Ana-Clara S. Exemplo",
    "Renata",
    "a".repeat(120),
  ])("accepts %j", (value) => {
    expect(isValidResponsavel(value)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["over 120", "a".repeat(121)],
    ["a digit", "Maria 2"],
    ["a formula", '=HYPERLINK("x")'],
    ["markup", "<img src=x>"],
    ["a control character", "Maria\u0007"],
    ["a blank Hangul filler", "Maria ㅤ"],
    ["three combining marks", "á́́"],
  ])("refuses %s", (_, value) => {
    expect(isValidResponsavel(value)).toBe(false);
  });
});

describe("isValidExtId (≤ 64 printable)", () => {
  it.each(["A1", "loja-123_x", "x".repeat(64), "id com espaco"])(
    "accepts %j",
    (value) => {
      expect(isValidExtId(value)).toBe(true);
    },
  );

  it.each([
    ["empty", ""],
    ["over 64", "x".repeat(65)],
    ["non-ASCII", "ação"],
    ["a control character", "a\tb"],
  ])("refuses %s", (_, value) => {
    expect(isValidExtId(value)).toBe(false);
  });
});

describe("isBatchId (A-X3 tightened by Security C10: ≥ 128 bits)", () => {
  it.each([
    "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    "lote_ABCDEFGHIJKLMNOPQR",
    "a".repeat(64),
  ])("accepts %j", (value) => {
    expect(isBatchId(value)).toBe(true);
  });

  it.each([
    "",
    "short",
    // 16–21 characters pass A-X3's generic panel id, not C10's batch id.
    "lote_ABCDEFGHIJKLMNOP",
    "a".repeat(21),
    "a".repeat(65),
    "../x",
    "a b c d e f g h i j k l",
    "lote%2Fx-0123456789abcdef",
  ])("refuses %j", (value) => {
    expect(isBatchId(value)).toBe(false);
  });

  it("agrees with the batch API paths' check", () => {
    for (const value of [
      "lote_ABCDEFGHIJKLMNOPQR",
      "lote_ABCDEFGHIJKLMNOP",
      "../x",
    ])
      expect(isBatchId(value)).toBe(
        (() => {
          try {
            apiPaths.panel.batches.get(value);
            return true;
          } catch {
            return false;
          }
        })(),
      );
  });
});

describe("rows query values (D-B3, C2)", () => {
  it("statuses are the four row words", () => {
    for (const status of ["ok", "warn", "bad", "erro"])
      expect(isBatchRowStatus(status)).toBe(true);
    for (const status of ["", "OK", "todos", "processando"])
      expect(isBatchRowStatus(status)).toBe(false);
  });

  it("a cursor is base64url of at most 512 characters (Security C11)", () => {
    expect(isBatchCursor("eyJvZmZzZXQiOjI1fQ")).toBe(true);
    expect(isBatchCursor("c_25-x")).toBe(true);
    expect(isBatchCursor("c".repeat(512))).toBe(true);
    for (const cursor of [
      "",
      "a b",
      "x/y",
      "x&status=ok",
      "eyJvIjoyNX0=",
      "c.x",
      "c~x",
      "c".repeat(513),
    ])
      expect(isBatchCursor(cursor)).toBe(false);
  });
});

describe("the progress poll's cadence (ADR-0011 rule 3: one module)", () => {
  it("is 2 s (D-B2)", () => {
    expect(BATCH_PROGRESS_INTERVAL_MS).toBe(2000);
  });
});

describe("the F07 charset stays in step with the seller link's", () => {
  it.each([
    "Maria Exemplo",
    "João D'Ávila",
    "Maria 2 Exemplo",
    "Maria ㅤ Exemplo",
    "Ana <b> Exemplo",
  ])("agrees on %j", (name) => {
    expect(isValidResponsavel(name)).toBe(
      verifySchema.shape.responsavel.safeParse(name).success,
    );
  });
});
