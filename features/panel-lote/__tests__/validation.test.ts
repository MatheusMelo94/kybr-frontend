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
import { isValidPanelId } from "@/lib/api/path";

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

describe("isBatchId (A-X3)", () => {
  it.each([
    "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    "lote_ABCDEFGHIJKLMNOP",
    "a".repeat(64),
  ])("accepts %j", (value) => {
    expect(isBatchId(value)).toBe(true);
  });

  it.each([
    "",
    "short",
    "a".repeat(65),
    "../x",
    "a b c d e f g h i",
    "lote%2Fx-0123456789",
  ])("refuses %j", (value) => {
    expect(isBatchId(value)).toBe(false);
  });

  it("agrees with the API path's panel id check", () => {
    for (const value of ["lote_ABCDEFGHIJKLMNOP", "short", "../x"])
      expect(isBatchId(value)).toBe(isValidPanelId(value));
  });
});

describe("rows query values (D-B3, C2)", () => {
  it("statuses are the four row words", () => {
    for (const status of ["ok", "warn", "bad", "erro"])
      expect(isBatchRowStatus(status)).toBe(true);
    for (const status of ["", "OK", "todos", "processando"])
      expect(isBatchRowStatus(status)).toBe(false);
  });

  it("a cursor is an opaque URL-safe token of at most 256 characters", () => {
    expect(isBatchCursor("eyJvZmZzZXQiOjI1fQ==")).toBe(true);
    expect(isBatchCursor("c_25.x~y-z")).toBe(true);
    for (const cursor of ["", "a b", "x/y", "x&status=ok", "c".repeat(257)])
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
