import { z } from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/panel-auth/validation";

// The Configurações actions' input schemas (plan-m8 D4, D7), authoritative
// and server-side. Unknown keys are refused (.strict, plan § 4).

/** C-M8-8 D-W4: the user's own name, 1..80 after trimming. */
export const OWN_NAME_MAX_LENGTH = 80;

export const ownNameSchema = z.strictObject({
  nome: z.string().trim().min(1).max(OWN_NAME_MAX_LENGTH),
});

/**
 * C-M8-7 D-A6: both passwords as typed (never trimmed), ≤ 128 (O-F2). The
 * new one meets the sign-up minimum; the API applies the breach check.
 */
export const changePasswordSchema = z.strictObject({
  senha_atual: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  senha_nova: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
