import {
  isHelpUrl,
  type ContactType,
} from "@/features/panel-onboarding/validation";
import { isEmail } from "@/features/panel-auth/validation";

// Configurações' field rules as plain functions for the client leaf (no zod
// in a panel client bundle; see panel-auth/validation.ts). settingsSchema
// is built from the same rules and limits.

/** C-M8-8 D-W4: the user's own name, 1..80 after trimming. */
export const OWN_NAME_MAX_LENGTH = 80;
/** The D-W3 platform name (C-M8-9: shown on the seller link). */
export const PLATFORM_NAME_MAX_LENGTH = 80;

export type SettingsField = "nome_plataforma" | "valor" | "nome";

const fits = (value: string, max: number): boolean => {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max;
};

/** The fields that break a rule, in form order (G7: the onboarding contact rules, O-F8). */
export function settingsIssues(values: {
  nome_plataforma: string;
  tipo: ContactType;
  valor: string;
  nome: string;
}): SettingsField[] {
  const valor = values.valor.trim();
  const issues: SettingsField[] = [];
  if (!fits(values.nome_plataforma, PLATFORM_NAME_MAX_LENGTH))
    issues.push("nome_plataforma");
  if (values.tipo === "email" ? !isEmail(valor) : !isHelpUrl(valor))
    issues.push("valor");
  if (!fits(values.nome, OWN_NAME_MAX_LENGTH)) issues.push("nome");
  return issues;
}
