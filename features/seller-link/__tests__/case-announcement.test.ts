// @vitest-environment node
import { describe, expect, it } from "vitest";

import { caseAnnouncement } from "@/features/seller-link/case-announcement";
import { publicCaseSchema } from "@/lib/api/schemas/public-link";

const CREATED = "2026-10-01T12:00:00.000Z";
const approved = publicCaseSchema.parse({
  estado: "approved",
  criado_em: CREATED,
  resultado: {
    razao_social: "Comercial Exemplo Ltda.",
    responsavel: "Maria Exemplo Silva",
    consultado_em: CREATED,
  },
});

describe("caseAnnouncement (spec § Accessibility Acceptance)", () => {
  it.each([
    ["verifying", "Consultando Receita Federal, Simples Nacional e SINTEGRA…"],
    ["analysis-timeout", "Sua empresa está em análise"],
    ["analysis-notfound", "Sua empresa está em análise"],
    ["pending", "Quase lá"],
    ["blocked", "Não conseguimos aprovar seu cadastro"],
  ] as const)("announces %s as %j", (viewKey, text) => {
    expect(caseAnnouncement(viewKey, approved)).toBe(text);
  });

  it("announces tudo certo with the first name, as its h1 says", () => {
    expect(caseAnnouncement("approved", approved)).toBe("Tudo certo, Maria.");
  });
});
