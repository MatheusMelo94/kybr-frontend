import { z } from "zod";

// The auth forms' schemas (plan § 3.4), shared by the client leaves (inline
// checks) and the Server Actions (authoritative). Unknown keys are dropped.

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
