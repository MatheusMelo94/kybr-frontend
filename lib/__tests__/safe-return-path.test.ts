import { describe, expect, it } from "vitest";

import { safeReturnPath } from "@/lib/safe-return-path";

// ADR-0009 rule 11, threat model P10, AC 5: `volta` never leaves the panel.
describe("safeReturnPath", () => {
  it.each([
    ["/fila", "/fila"],
    ["/fila/abc?aba=x", "/fila/abc?aba=x"],
    ["%2Ffila%3Faba%3Dx", "/fila?aba=x"],
    ["/", "/"],
    ["/comecar", "/comecar"],
    [
      "/lote/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
      "/lote/3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
    ],
    ["/monitoramento", "/monitoramento"],
    ["/fila#x", "/fila"],
  ])("accepts %j as %j", (volta, expected) => {
    expect(safeReturnPath(volta)).toBe(expected);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "https:evil.example",
    "https://evil",
    "javascript:alert(1)",
    "/fila\u0000",
    "/fila\n/x",
    "/fila\\x",
    "/v/x",
    "/v/loja-exemplo",
    "/entrar",
    "/cadastro",
    "/cadastro/confirmar",
    "/senha/esqueci",
    "/senha/nova",
    "/desconhecida",
    "/filas",
    "/painel/fila",
    "fila",
    "",
    "%E0%A4%A",
    `/fila/${"a".repeat(512)}`,
  ])("rejects %j", (volta) => {
    expect(safeReturnPath(volta)).toBeNull();
  });

  it.each([null, undefined])("is null for %s", (volta) => {
    expect(safeReturnPath(volta)).toBeNull();
  });

  // Security M5C-03: a login never router.pushes to a download Route Handler
  // (two audited exports and a stranded user); it lands on the batch page.
  it.each([
    [
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b/resultado.csv",
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    ],
    [
      "%2Flote%2F3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b%2Ferros.csv",
      "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    ],
    [
      "/lote/abcdefghijklmnopqrstuv/resultado.csv?x=1",
      "/lote/abcdefghijklmnopqrstuv",
    ],
  ])("maps the download %j to its batch page", (volta, expected) => {
    expect(safeReturnPath(volta)).toBe(expected);
  });
});
