import { describe, expect, it } from "vitest";

import {
  fill,
  formatData,
  formatDataHora,
  minutosFromSeconds,
  primeiroNome,
} from "@/features/seller-link/format";
import { formCopy } from "@/features/seller-link/copy/form";
import { privacyCopy } from "@/features/seller-link/copy/privacy";

describe("fill", () => {
  it("replaces every placeholder, including repeats", () => {
    expect(
      fill(privacyCopy["privacy.who"], { marketplace: "Loja Exemplo" }),
    ).toBe(
      "Loja Exemplo decide como seus dados são usados neste cadastro (controladora). A Kybr faz a verificação em nome de Loja Exemplo (operadora).",
    );
  });

  it("formats numbers", () => {
    expect(
      fill(formCopy["form.submit.error.limit_generic"], { minutos: 9 }),
    ).toBe("Muitas tentativas seguidas. Tente de novo em 9 min.");
  });

  it("requires every placeholder at compile time", () => {
    // @ts-expect-error: {minutos} is missing.
    expect(fill(formCopy["form.submit.error.limit_cnpj"], {})).toContain(
      "{minutos}",
    );
  });
});

describe("formatData ({data})", () => {
  it("formats dd/mm/aaaa in Brasília time", () => {
    expect(formatData("2026-10-03T15:00:00.000Z")).toBe("03/10/2026");
  });

  it("uses the Brasília date, not the UTC one, near midnight", () => {
    expect(formatData("2026-10-03T02:30:00.000Z")).toBe("02/10/2026");
  });
});

describe("formatDataHora ({data_hora})", () => {
  it('formats "dd/mm, hh:mm" on a 24 h clock in Brasília time', () => {
    expect(formatDataHora("2026-10-05T18:45:00.000Z")).toBe("05/10, 15:45");
  });

  it("shows midnight as 00:00", () => {
    expect(formatDataHora("2026-10-04T03:00:00.000Z")).toBe("04/10, 00:00");
  });
});

describe("minutosFromSeconds ({minutos})", () => {
  it.each([
    [540, 9],
    [541, 10],
    [60, 1],
    [59, 1],
    [1, 1],
    [0, 1],
  ])(
    "turns %i s into %i min (whole minutes, at least 1)",
    (seconds, minutes) => {
      expect(minutosFromSeconds(seconds)).toBe(minutes);
    },
  );
});

describe("primeiroNome ({primeiro_nome})", () => {
  it.each([
    ["Maria Exemplo Silva", "Maria"],
    ["  joão da silva ", "joão"],
    ["ANA", "ANA"],
  ])("returns the first token of %j as typed", (name, first) => {
    expect(primeiroNome(name)).toBe(first);
  });
});
