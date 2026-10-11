// @vitest-environment node
import { describe, expect, it } from "vitest";

import { appErrorFromResponse } from "@/lib/api/errors";

function envelope(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req-1" },
  });
}

describe("batch error codes (A-X2, M5)", () => {
  it.each([
    [404, "LOTE_NAO_ENCONTRADO"],
    [422, "MUITAS_LINHAS"],
    [422, "SEM_CNPJ_VALIDO"],
    [409, "LOTE_EM_ANDAMENTO"],
  ] as const)("%s %s is recognized", async (status, code) => {
    const error = await appErrorFromResponse(
      envelope(status, { code, message: "MSG-BACKEND-NAO-EXIBIR" }),
    );
    expect(error.code).toBe(code);
    expect(error.message).not.toContain("MSG-BACKEND-NAO-EXIBIR");
  });

  it("402 SEM_SALDO keeps disponiveis", async () => {
    const error = await appErrorFromResponse(
      envelope(402, {
        code: "SEM_SALDO",
        message: "MSG-BACKEND-NAO-EXIBIR",
        disponiveis: 100,
      }),
    );
    expect(error.code).toBe("SEM_SALDO");
    expect(error.disponiveis).toBe(100);
    expect(JSON.stringify(error)).not.toContain("MSG-BACKEND-NAO-EXIBIR");
  });

  it("a malformed disponiveis reads as missing", async () => {
    const error = await appErrorFromResponse(
      envelope(402, { code: "SEM_SALDO", disponiveis: -3 }),
    );
    expect(error.disponiveis).toBeUndefined();
  });
});

describe("case error codes (A-X2, M6)", () => {
  it.each([
    [404, "CASO_NAO_ENCONTRADO"],
    [409, "CASO_JA_DECIDIDO"],
    [422, "MOTIVO_OBRIGATORIO"],
    [422, "DOCUMENTO_NAO_HABILITADO"],
  ] as const)("%s %s is recognized; message is never read", async (status, code) => {
    const error = await appErrorFromResponse(
      envelope(status, { code, message: "MSG-BACKEND-NAO-EXIBIR" }),
    );
    expect(error.code).toBe(code);
    expect(JSON.stringify(error)).not.toContain("MSG-BACKEND-NAO-EXIBIR");
    expect(error.message).not.toContain("MSG-BACKEND-NAO-EXIBIR");
  });

  it("409 CASO_JA_DECIDIDO keeps decidido_em and decisao (C-M6-7)", async () => {
    const error = await appErrorFromResponse(
      envelope(409, {
        code: "CASO_JA_DECIDIDO",
        message: "MSG-BACKEND-NAO-EXIBIR",
        decidido_em: "2026-10-06T10:00:00-03:00",
        decisao: { tipo: "bloquear", motivo_codigo: "MEI" },
      }),
    );
    expect(error.decididoEm).toBe("2026-10-06T10:00:00-03:00");
    expect(error.decisao).toEqual({ tipo: "bloquear", motivoCodigo: "MEI" });
  });

  it("a malformed decidido_em or decisao reads as missing", async () => {
    const error = await appErrorFromResponse(
      envelope(409, {
        code: "CASO_JA_DECIDIDO",
        decidido_em: "ontem",
        decisao: { tipo: "arquivar" },
      }),
    );
    expect(error.code).toBe("CASO_JA_DECIDIDO");
    expect(error.decididoEm).toBeUndefined();
    expect(error.decisao).toBeUndefined();
  });
});

describe("password change error codes (C-M8-7, Security O-F1)", () => {
  it("403 SENHA_ATUAL_INCORRETA is recognized and is not a session error", async () => {
    const error = await appErrorFromResponse(
      envelope(403, {
        code: "SENHA_ATUAL_INCORRETA",
        message: "MSG-BACKEND-NAO-EXIBIR",
      }),
    );
    expect(error.code).toBe("SENHA_ATUAL_INCORRETA");
    expect(error.status).toBe(403);
    expect(JSON.stringify(error)).not.toContain("MSG-BACKEND-NAO-EXIBIR");
  });

  it("422 SENHA_FRACA is still recognized", async () => {
    const error = await appErrorFromResponse(
      envelope(422, { code: "SENHA_FRACA", message: "MSG-BACKEND-NAO-EXIBIR" }),
    );
    expect(error.code).toBe("SENHA_FRACA");
  });
});

describe("seller and policy error codes (C-M8-3, C-M8-4, C-M8-6)", () => {
  it.each([
    [409, "REVERIFICACAO_EM_ANDAMENTO"],
    [409, "POLITICA_DESATUALIZADA"],
    [422, "SEM_DOCUMENTO_HABILITADO"],
    [404, "SELLER_NAO_ENCONTRADO"],
  ])("%i %s is recognized", async (status, code) => {
    const error = await appErrorFromResponse(
      envelope(status, { code, message: "MSG-BACKEND-NAO-EXIBIR" }),
    );
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(JSON.stringify(error)).not.toContain("MSG-BACKEND-NAO-EXIBIR");
  });
});
