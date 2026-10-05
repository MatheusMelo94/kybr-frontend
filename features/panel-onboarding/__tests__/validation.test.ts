import { describe, expect, it } from "vitest";

import { onboardingSchema } from "@/features/panel-onboarding/schemas";
import {
  isHelpUrl,
  onboardingIssues,
} from "@/features/panel-onboarding/validation";

const CATEGORY = "5b3c1f0e-8a2d-4c6e-9f10-2a3b4c5d6e01";

describe("onboarding rules (D-W3, seller-link X4)", () => {
  it.each(["https://ajuda.exemplo.test", "https://exemplo.test/ajuda?x=1"])(
    "%s is a help page",
    (url) => {
      expect(isHelpUrl(url)).toBe(true);
    },
  );

  it.each([
    "http://ajuda.exemplo.test",
    "javascript:alert(1)",
    "ajuda.exemplo.test",
    "https://user:pass@exemplo.test",
    `https://exemplo.test/${"a".repeat(2048)}`,
  ])("%s isn't", (url) => {
    expect(isHelpUrl(url)).toBe(false);
  });

  it.each([
    [{ tipo: "email", valor: "x", categoria: CATEGORY }, ["valor"]],
    [{ tipo: "email", valor: "a?b@c.co", categoria: CATEGORY }, ["valor"]],
    [{ tipo: "url", valor: "http://x.co", categoria: CATEGORY }, ["valor"]],
    [
      { tipo: "email", valor: "suporte@exemplo.test", categoria: "" },
      ["categoria"],
    ],
    [{ tipo: "url", valor: "", categoria: "" }, ["valor", "categoria"]],
    [{ tipo: "email", valor: "suporte@exemplo.test", categoria: CATEGORY }, []],
  ] as const)("%j → %j, and the server schema agrees", (values, issues) => {
    expect(onboardingIssues(values)).toEqual(issues);
    const parsed = onboardingSchema.safeParse({
      contato_vendedor: { tipo: values.tipo, valor: values.valor },
      categoria: values.categoria,
    });
    expect(parsed.success).toBe(issues.length === 0);
  });

  it("the schema is strict: no workspace or extra field reaches the API", () => {
    const parsed = onboardingSchema.safeParse({
      contato_vendedor: { tipo: "email", valor: "suporte@exemplo.test" },
      categoria: CATEGORY,
      nome: "outro",
    });
    expect(parsed.success).toBe(false);
  });
});
