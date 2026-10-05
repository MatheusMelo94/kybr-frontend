import { z } from "zod";

import { isEmail } from "@/features/panel-auth/validation";
import { isHelpUrl } from "@/features/panel-onboarding/validation";

/** D-W3 onboarding (plan § 3.4), authoritative, server-side. Strict: no other field reaches the API. */
export const onboardingSchema = z
  .object({
    contato_vendedor: z.discriminatedUnion("tipo", [
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
    ]),
    categoria: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();

export type OnboardingInput = z.infer<typeof onboardingSchema>;
