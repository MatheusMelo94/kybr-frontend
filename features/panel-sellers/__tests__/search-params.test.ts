import { describe, expect, it } from "vitest";

import {
  parseSellersSearch,
  sellersHref,
} from "@/features/panel-sellers/search-params";

// T140 (plan-m8 D5): Vendedores' state lives in the URL. An unknown,
// repeated or oversized value is the default, never an API parameter.

describe("parseSellersSearch", () => {
  it("defaults: no q, no status, page 1", () => {
    expect(parseSellersSearch({})).toEqual({ pagina: 1 });
  });

  it("reads q (trimmed), a known status and a page", () => {
    expect(
      parseSellersSearch({ q: "  Exemplo ", status: "mudou", pagina: "3" }),
    ).toEqual({ q: "Exemplo", status: "mudou", pagina: 3 });
  });

  it.each([
    ["12.345.678/0001-95", "12345678000195"],
    ["12.345.678", "12345678"],
    ["ab.cde.fgh/0001-95", "ABCDEFGH000195"],
    ["12345678000195", "12345678000195"],
  ])("D5: a masked CNPJ %s is normalized to %s", (q, normalized) => {
    expect(parseSellersSearch({ q }).q).toBe(normalized);
  });

  it("anything else is sent as typed", () => {
    expect(parseSellersSearch({ q: "Comércio 12 Ltda." }).q).toBe(
      "Comércio 12 Ltda.",
    );
  });

  it.each([
    [{ q: "x".repeat(101) }, {}],
    [{ q: "   " }, {}],
    [{ q: ["a", "b"] }, {}],
    [{ status: "suspenso" }, {}],
    [{ status: ["mudou", "aprovado"] }, {}],
  ])("drops %j", (params, expected) => {
    expect(parseSellersSearch(params)).toEqual({ pagina: 1, ...expected });
  });

  it.each(["0", "-1", "1.5", "x", "", "100001"])(
    "an invalid pagina %j is 1",
    (pagina) => {
      expect(parseSellersSearch({ pagina }).pagina).toBe(1);
    },
  );

  it("q of exactly 100 characters is kept", () => {
    expect(parseSellersSearch({ q: "x".repeat(100) }).q).toHaveLength(100);
  });
});

describe("sellersHref", () => {
  it("leaves the defaults out", () => {
    expect(sellersHref({ pagina: 1 })).toBe("/vendedores");
  });

  it("status, q, then pagina (when > 1)", () => {
    expect(sellersHref({ status: "revisao", q: "Ação & cia", pagina: 2 })).toBe(
      "/vendedores?status=revisao&q=A%C3%A7%C3%A3o+%26+cia&pagina=2",
    );
  });
});
