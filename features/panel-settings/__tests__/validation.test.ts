import { describe, expect, it } from "vitest";

import { settingsFields } from "@/features/panel-settings/schemas";
import { settingsIssues } from "@/features/panel-settings/validation";

// T135: Configurações' client rules, the same as settingsSchema (one source
// of truth, no zod in the client leaf).

const OK = {
  nome_plataforma: "Loja Exemplo",
  tipo: "email" as const,
  valor: "ajuda@exemplo.test",
  nome: "Renata Exemplo",
};

describe("settingsIssues (T135)", () => {
  it("accepts a valid form", () => {
    expect(settingsIssues(OK)).toEqual([]);
  });

  it("lists the broken fields in form order", () => {
    expect(
      settingsIssues({ ...OK, nome_plataforma: "  ", valor: "x", nome: "" }),
    ).toEqual(["nome_plataforma", "valor", "nome"]);
  });

  it("O-F8: a javascript: (or any non-https) contact URL is refused", () => {
    for (const valor of [
      "javascript:alert(1)",
      "http://exemplo.test",
      "https://u:p@exemplo.test",
    ])
      expect(settingsIssues({ ...OK, tipo: "url", valor })).toEqual(["valor"]);
    expect(
      settingsIssues({
        ...OK,
        tipo: "url",
        valor: "https://exemplo.test/ajuda",
      }),
    ).toEqual([]);
  });

  it("names longer than 80 are refused", () => {
    expect(
      settingsIssues({
        ...OK,
        nome_plataforma: "a".repeat(81),
        nome: "b".repeat(81),
      }),
    ).toEqual(["nome_plataforma", "nome"]);
  });

  it("agrees with the server schema", () => {
    for (const values of [
      OK,
      { ...OK, nome_plataforma: "" },
      { ...OK, tipo: "url" as const, valor: "javascript:alert(1)" },
      { ...OK, nome: "a".repeat(81) },
    ]) {
      const { tipo, valor, ...rest } = values;
      expect(
        settingsFields({ ...rest, contato_vendedor: { tipo, valor } }),
      ).toEqual(settingsIssues(values));
    }
  });
});
