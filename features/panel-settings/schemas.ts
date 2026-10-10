import { z } from "zod";

import { contatoVendedorSchema } from "@/features/panel-onboarding/schemas";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/panel-auth/validation";
import {
  OWN_NAME_MAX_LENGTH,
  PLATFORM_NAME_MAX_LENGTH,
  type SettingsField,
} from "@/features/panel-settings/validation";

export type { SettingsField };

// The Configurações actions' input schemas (plan-m8 D4, D7), authoritative
// and server-side. Unknown keys are refused (.strict, plan § 4).

export const ownNameSchema = z.strictObject({
  nome: z.string().trim().min(1).max(OWN_NAME_MAX_LENGTH),
});

/**
 * saveSettingsAction: the platform (D-W3) and the own name (D-W4). There is
 * no slug: the link's cache tag comes from the session (M2-07, O-F8).
 */
export const settingsSchema = z.strictObject({
  nome_plataforma: z.string().trim().min(1).max(PLATFORM_NAME_MAX_LENGTH),
  contato_vendedor: contatoVendedorSchema,
  nome: z.string().trim().min(1).max(OWN_NAME_MAX_LENGTH),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

/** The fields a refused settings input breaks, in form order (shape only). */
export function settingsFields(input: unknown): SettingsField[] {
  const value = (typeof input === "object" && input !== null ? input : {}) as {
    nome_plataforma?: unknown;
    contato_vendedor?: unknown;
    nome?: unknown;
  };
  const shape = settingsSchema.shape;
  const fields: SettingsField[] = [];
  if (!shape.nome_plataforma.safeParse(value.nome_plataforma).success)
    fields.push("nome_plataforma");
  if (!shape.contato_vendedor.safeParse(value.contato_vendedor).success)
    fields.push("valor");
  if (!shape.nome.safeParse(value.nome).success) fields.push("nome");
  return fields;
}

/**
 * C-M8-7 D-A6: both passwords as typed (never trimmed), ≤ 128 (O-F2). The
 * new one meets the sign-up minimum; the API applies the breach check.
 */
export const changePasswordSchema = z.strictObject({
  senha_atual: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  senha_nova: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
