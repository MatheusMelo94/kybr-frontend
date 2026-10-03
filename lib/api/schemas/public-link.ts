import "server-only";

import { z } from "zod";

import { maskCpf } from "@/lib/cpf";
import { toSafeHttpsUrl, type SafeHttpsUrl } from "@/lib/safe-url";

// Response schemas for the seller link's public API (contract D1–D3). Server
// only, so they use regular zod (ADR-0003 rule 3). Unknown keys are stripped,
// so nothing beyond the projection reaches a component.

/**
 * A contact e-mail strict enough to become a mailto: safely: plain ASCII
 * local@domain, with no ?, &, #, %, spaces or control characters (threat
 * model § 6 item 3).
 */
const STRICT_EMAIL =
  /^[A-Za-z0-9._+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

const safeHttpsUrl = z.string().transform((value, ctx): SafeHttpsUrl => {
  const url = toSafeHttpsUrl(value);
  if (url === undefined) {
    ctx.addIssue({ code: "custom", message: "Not an https: URL" });
    return z.NEVER;
  }
  return url;
});

/** D1: the workspace name and the seller contact (contract X4). */
export const publicLinkSchema = z.object({
  nome: z.string().min(1),
  contato_vendedor: z.discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal("email"),
      valor: z.string().max(254).regex(STRICT_EMAIL),
    }),
    z.object({ tipo: z.literal("url"), valor: safeHttpsUrl }),
  ]),
});

export type PublicLink = z.output<typeof publicLinkSchema>;

/**
 * D2: the U-E projection: business name, main activity, city and state. Never
 * a street address. Any CPF left in the name is masked here, as a backstop to
 * the backend's own masking (contract X7).
 */
export const companyLookupSchema = z.object({
  razao_social: z.string().min(1).transform(maskCpf),
  municipio: z.string().min(1),
  uf: z.string().regex(/^[A-Z]{2}$/),
  cnae: z.object({ descricao: z.string().min(1) }),
});

export type CompanyLookup = z.output<typeof companyLookupSchema>;

/** D3: an opaque case token (contract X3), checked before it can steer router.push. */
export const verificationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
});
