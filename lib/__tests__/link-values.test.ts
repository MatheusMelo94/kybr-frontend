import { describe, expect, it } from "vitest";

import { SLUG_PATTERN, TOKEN_PATTERN } from "@/lib/link-values";
import { parseLinkVendedor } from "@/lib/panel-api-values";

// F8 (amended 2026-10-06): the seller-link slug and token patterns (contract
// X3) live once; the API path builders and parseLinkVendedor import them.

const HOST = "kybr.test";

describe("the X3 slug and token patterns", () => {
  it.each([
    ["a", true],
    ["loja-exemplo", true],
    ["a".repeat(64), true],
    ["a".repeat(65), false],
    ["-loja", false],
    ["loja-", false],
    ["Loja", false],
  ])("slug %s → %s", (slug, valid) => {
    expect(SLUG_PATTERN.test(slug)).toBe(valid);
  });

  it.each([
    ["A".repeat(21), false],
    ["A".repeat(22), true],
    ["a_B-".repeat(16), true],
    ["A".repeat(65), false],
    ["A".repeat(22) + ".", false],
  ])("token %s → %s", (token, valid) => {
    expect(TOKEN_PATTERN.test(token)).toBe(valid);
  });

  it("parseLinkVendedor agrees with both patterns, segment by segment", () => {
    for (const slug of ["a", "a".repeat(64), "a".repeat(65), "-x"])
      for (const token of ["A".repeat(22), "A".repeat(64), "A".repeat(65)]) {
        const link = `https://${HOST}/v/${slug}/c/${token}`;
        expect(parseLinkVendedor(link, HOST) === link).toBe(
          SLUG_PATTERN.test(slug) && TOKEN_PATTERN.test(token),
        );
      }
  });
});
