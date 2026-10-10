import { z } from "zod";

import { isEmail } from "@/features/panel-auth/validation";
import { isHelpUrl } from "@/features/panel-onboarding/validation";

/**
 * D-W3's seller contact (link X4): a plain e-mail, or an https: URL ≤ 2048
 * with no credentials. Shared with Configurações (plan-m8 G7, Security O-F8).
 */
export const contatoVendedorSchema = z.discriminatedUnion("tipo", [
  z
    .object({
      tipo: z.literal("email"),
      valor: z.string().trim().refine(isEmail),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("url"),
      valor: z.string().trim().refine(isHelpUrl),
    })
    .strict(),
]);

/** D-W3 onboarding (plan § 3.4), authoritative, server-side. Strict: no other field reaches the API. */
export const onboardingSchema = z
  .object({
    contato_vendedor: contatoVendedorSchema,
    categoria: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();

export type OnboardingInput = z.infer<typeof onboardingSchema>;
