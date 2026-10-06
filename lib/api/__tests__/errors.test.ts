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
