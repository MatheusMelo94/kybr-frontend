// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupCompanyAction } from "@/features/seller-link/actions";
import {
  MEI_CNPJS,
  SLUGS,
  cnpjFor,
} from "@/tests/fixtures/factories/seller-link";

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

beforeEach(() => {
  requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.7" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lookupCompanyAction (read-only, ADR-0004a)", () => {
  it("returns only the company block's projection", async () => {
    const result = await lookupCompanyAction(SLUGS.ok, cnpjFor("aprovado"));

    expect(result).toEqual({
      ok: true,
      company: {
        razaoSocial: expect.any(String),
        atividade: expect.any(String),
        municipio: expect.any(String),
        uf: expect.stringMatching(/^[A-Z]{2}$/),
      },
    });
  });

  it("works for an alphanumeric CNPJ (S16)", async () => {
    expect((await lookupCompanyAction(SLUGS.ok, "12ABC34501DE35")).ok).toBe(
      true,
    );
  });

  it("masks a CPF the API left unmasked (S18)", async () => {
    expect(
      await lookupCompanyAction(SLUGS.ok, MEI_CNPJS.unmasked),
    ).toMatchObject({
      ok: true,
      company: { razaoSocial: "JOAO CARLOS SILVA ***.***.***-**" },
    });
  });

  it("returns not_found for S7", async () => {
    expect(await lookupCompanyAction(SLUGS.ok, cnpjFor("sem-dados"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it.each([
    ["S8 rate-limited", SLUGS.ok, cnpjFor("limite-consulta")],
    ["S19 kill switch", SLUGS.noAutofill, cnpjFor("aprovado")],
  ])("returns failed for %s", async (_case, slug, cnpj) => {
    expect(await lookupCompanyAction(slug, cnpj)).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it.each([
    ["a malformed slug", "../admin", cnpjFor("aprovado")],
    ["a non-string slug", { slug: "loja-exemplo" }, cnpjFor("aprovado")],
    ["a lowercase CNPJ", SLUGS.ok, "12abc34501de35"],
    ["a masked CNPJ", SLUGS.ok, "12.ABC.345/01DE-35"],
    ["an invalid CNPJ", SLUGS.ok, "12ABC34501DE36"],
    ["a non-string CNPJ", SLUGS.ok, 12345678000195],
  ])("refuses %s without calling the API", async (_case, slug, cnpj) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await lookupCompanyAction(slug, cnpj)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
