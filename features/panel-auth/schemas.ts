import { z } from "zod";

import {
  CODE_PATTERN,
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_TOKEN_PATTERN,
  SIGNUP_FIELDS,
  WORKSPACE_MAX_LENGTH,
  type SignupField,
} from "@/features/panel-auth/validation";

// The auth actions' schemas (plan § 3.4), authoritative and server-side. The
// client leaves check the same rules through validation.ts, which these
// schemas are built from (the panel's client bundles never import zod:
// see validation.ts). Unknown keys are dropped.

const email = z.string().trim().toLowerCase().min(1).max(254);
const turnstile = z.string().min(1).max(2048);

/** D-A4 login: the password as typed (never trimmed), ≤ 128 (U-P8). */
export const loginSchema = z.object({
  email,
  senha: z.string().min(1).max(128),
  turnstile: turnstile.optional(),
  /** Re-validated server-side with safeReturnPath (ADR-0009 rule 11). */
  volta: z.string().max(2048).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export { PASSWORD_MIN_LENGTH, type SignupField };

/** D-A1 sign-up. The terms version comes from config, never the client. */
export const signupSchema = z.object({
  nome: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  workspace: z.string().trim().min(1).max(WORKSPACE_MAX_LENGTH),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH)
    .regex(EMAIL_PATTERN),
  senha: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  aceite: z.literal(true),
  turnstile,
  // A-X7, F17: a UUID only, checked before it becomes a header.
  idempotencyKey: z.uuid(),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** The visible fields a schema failure points at, in form order. */
export function signupIssues(
  issues: readonly z.core.$ZodIssue[],
): Partial<Record<SignupField, true>> {
  const fields: Partial<Record<SignupField, true>> = {};
  for (const field of SIGNUP_FIELDS)
    if (issues.some((issue) => issue.path[0] === field)) fields[field] = true;
  return fields;
}

/** D-A2: the code only. The ticket comes from the sign-up cookie, never the client. */
export const confirmSchema = z.object({
  codigo: z.string().regex(CODE_PATTERN),
});

/** D-A3: the Turnstile token only (the ticket, again, from the cookie). */
export const resendSchema = z.object({ turnstile });

/** D-A5 request: the address and the Turnstile token. */
export const resetRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH)
    .regex(EMAIL_PATTERN),
  turnstile,
});

/** D-A5 confirm: the token from the URL fragment (posted by the leaf) and the new password. */
export const resetConfirmSchema = z.object({
  token: z.string().regex(RESET_TOKEN_PATTERN),
  senha: z.string(),
});
