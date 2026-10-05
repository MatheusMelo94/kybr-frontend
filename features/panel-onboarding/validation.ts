// The onboarding form's rules as plain functions for the client leaf (the
// panel's client bundles never import zod: see panel-auth/validation.ts).
// schemas.ts builds the action's zod schema from them.

import { isEmail } from "@/features/panel-auth/validation";

/** The seller link shows this URL (D-W3, seller-link X4): https: only, ≤ 2048, no credentials. */
export const HELP_URL_MAX_LENGTH = 2048;

export function isHelpUrl(value: string): boolean {
  if (value.length > HELP_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.username === "" && url.password === ""
    );
  } catch {
    return false;
  }
}

export type ContactType = "email" | "url";
export type OnboardingField = "valor" | "categoria";

/** The onboarding fields that break a rule, in form order. */
export function onboardingIssues(values: {
  tipo: ContactType;
  valor: string;
  categoria: string;
}): OnboardingField[] {
  const valor = values.valor.trim();
  const issues: OnboardingField[] = [];
  if (values.tipo === "email" ? !isEmail(valor) : !isHelpUrl(valor))
    issues.push("valor");
  if (values.categoria === "") issues.push("categoria");
  return issues;
}
