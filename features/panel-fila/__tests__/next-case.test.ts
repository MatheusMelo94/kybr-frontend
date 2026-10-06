import { describe, expect, it } from "vitest";

import { nextCaseId } from "@/features/panel-fila/next-case";

describe("nextCaseId (plan-m6 D5)", () => {
  it.each([
    [["a", "b", "c"], "b", "c"],
    [["a", "b", "c"], "a", "b"],
    [["a", "b", "c"], "c", "b"],
    [["a"], "a", null],
    [[], "a", null],
    [["a", "b"], "x", null],
  ] as const)("%j, decided %s → %s", (ids, decided, next) => {
    expect(nextCaseId(ids, decided)).toBe(next);
  });
});
