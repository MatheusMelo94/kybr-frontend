// @vitest-environment node
import { describe, expect, it } from "vitest";

import { apiPaths, isValidSlug, isValidToken } from "@/lib/api/path";

describe("apiPaths", () => {
  it("builds D1, D2 and D3 paths from valid segments", () => {
    expect(apiPaths.publicLink("loja-exemplo")).toBe("/public/v/loja-exemplo");
    expect(apiPaths.verify("loja-exemplo")).toBe(
      "/public/v/loja-exemplo/verify",
    );
    expect(apiPaths.lookup("loja-exemplo", "12ABC34501DE35")).toBe(
      "/public/v/loja-exemplo/lookup?cnpj=12ABC34501DE35",
    );
  });

  it.each([
    "../x",
    "..",
    "%2e%2e",
    "a%2Fb",
    "a/b",
    "a?b",
    "a#b",
    "@host",
    "loja@evil.test",
    "",
    "Loja-Exemplo",
    "-loja",
    "loja-",
    "a".repeat(65),
  ])("throws for the slug %j before anything is built", (slug) => {
    expect(() => apiPaths.publicLink(slug)).toThrow("Refused API path segment");
    expect(() => apiPaths.verify(slug)).toThrow("Refused API path segment");
    expect(() => apiPaths.lookup(slug, "11222333000181")).toThrow(
      "Refused API path segment",
    );
  });

  it.each([
    "12abc34501de35",
    "12.ABC.345/01DE-35",
    "12ABC34501DE3",
    "12ABC34501DE3A",
    "11222333000181&x=1",
    "11222333000181#x",
    "",
  ])("throws for the non-canonical CNPJ %j (X5 wire format only)", (cnpj) => {
    expect(() => apiPaths.lookup("loja-exemplo", cnpj)).toThrow(
      "Refused API path segment",
    );
  });
});

describe("X3 identifier checks", () => {
  it.each(["loja-exemplo", "a", "loja1", "a".repeat(64)])(
    "accepts the slug %j",
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each(["tokaprovado0000000000000", "AbC_dEf-0123456789abcdefgh"])(
    "accepts the token %j",
    (token) => {
      expect(isValidToken(token)).toBe(true);
    },
  );

  it.each([
    "short",
    "tok/../../00000000000000",
    "tok%2e%2e0000000000000000",
    "a".repeat(65),
  ])("rejects the token %j", (token) => {
    expect(isValidToken(token)).toBe(false);
  });
});
