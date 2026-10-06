import { describe, expect, it } from "vitest";

import {
  estadoOf,
  filaHref,
  parseFilaSearch,
} from "@/features/panel-fila/search-params";

// F12 / plan D2: ?aba= and ?ate= parsed plainly on the server; anything
// unexpected falls back to the default instead of reaching the API.

describe("parseFilaSearch", () => {
  it("defaults: aba aberto, ate 25", () => {
    expect(parseFilaSearch({})).toEqual({ aba: "aberto", ate: 25 });
  });

  it.each([
    ["aguardando", "aguardando"],
    ["aberto", "aberto"],
    ["aguardando_doc", "aberto"],
    ["AGUARDANDO", "aberto"],
    ["", "aberto"],
  ])("aba=%s → %s", (aba, expected) => {
    expect(parseFilaSearch({ aba }).aba).toBe(expected);
  });

  it.each([
    ["25", 25],
    ["50", 50],
    ["200", 200],
    ["225", 25],
    ["0", 25],
    ["37", 25],
    ["abc", 25],
    ["10000", 25],
    ["50.0", 25],
    ["+50", 25],
    ["050", 25],
    [" 50", 25],
  ])("ate=%s → %s", (ate, expected) => {
    expect(parseFilaSearch({ ate }).ate).toBe(expected);
  });

  it("a repeated param is not trusted", () => {
    expect(
      parseFilaSearch({ aba: ["aguardando", "aberto"], ate: ["50"] }),
    ).toEqual({
      aba: "aberto",
      ate: 25,
    });
  });
});

describe("estadoOf and filaHref", () => {
  it("maps the tab to the API's estado", () => {
    expect(estadoOf("aberto")).toBe("aberto");
    expect(estadoOf("aguardando")).toBe("aguardando_doc");
  });

  it("leaves the defaults out of the URL", () => {
    expect(filaHref("/fila", { aba: "aberto", ate: 25 })).toBe("/fila");
    expect(filaHref("/fila", { aba: "aberto", ate: 50 })).toBe("/fila?ate=50");
    expect(filaHref("/fila/x", { aba: "aguardando", ate: 25 })).toBe(
      "/fila/x?aba=aguardando",
    );
    expect(filaHref("/fila", { aba: "aguardando", ate: 75 })).toBe(
      "/fila?aba=aguardando&ate=75",
    );
  });
});
