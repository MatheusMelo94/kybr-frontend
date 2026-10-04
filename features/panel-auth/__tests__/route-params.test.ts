import { describe, expect, it } from "vitest";

import { entrarParams } from "@/features/panel-auth/route-params";

describe("entrarParams (/entrar ?volta, ?motivo, ?perdido)", () => {
  it.each([
    [{}, { volta: null, banner: null }],
    [{ volta: "/fila?aba=x" }, { volta: "/fila?aba=x", banner: null }],
    [{ volta: "//evil.example" }, { volta: null, banner: null }],
    [{ volta: ["/fila", "/lote"] }, { volta: null, banner: null }],
    [{ motivo: "sessao" }, { volta: null, banner: "sessao" }],
    [
      { motivo: "sessao", perdido: "1" },
      { volta: null, banner: "sessao-perdido" },
    ],
    [{ motivo: "saiu" }, { volta: null, banner: "saiu" }],
    [{ motivo: "senha-nova" }, { volta: null, banner: "senha-nova" }],
    [{ motivo: "outra" }, { volta: null, banner: null }],
    [
      { motivo: "saiu", perdido: "1" },
      { volta: null, banner: "saiu" },
    ],
  ])("%j → %j", (raw, expected) => {
    expect(entrarParams(raw)).toEqual(expected);
  });
});
