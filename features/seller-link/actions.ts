"use server";

import { z } from "zod";

import type { CompanySummary } from "@/features/seller-link/components/company-block";
import { isValidSlug } from "@/lib/api/path";
import { lookupCompany } from "@/lib/api/public-link";
import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

// Server Actions are public POST endpoints (frontend-security-conventions.md
// § Next.js Surface Map): every argument is untrusted and parsed with zod first.
// Only the actions themselves are exported (threat model § 3).

const lookupArgsSchema = z.object({
  slug: z.string().refine(isValidSlug),
  // The canonical wire format only (contract X5): normalized and valid.
  cnpj: z
    .string()
    .refine(
      (cnpj) => normalizeCnpj(cnpj) === cnpj && validateCnpj(cnpj) === "ok",
    ),
});

export type LookupActionResult =
  | { ok: true; company: CompanySummary }
  | { ok: false; reason: "not_found" | "failed" };

/**
 * Read-only action for the CNPJ autofill (ADR-0004a): called from the form when
 * a valid CNPJ is typed. It returns only the company block's projection. A
 * rate limit, the kill switch or any failure is `failed`: the form says so and
 * lets the seller continue, with no automatic retry.
 */
export async function lookupCompanyAction(
  slug: unknown,
  cnpj: unknown,
): Promise<LookupActionResult> {
  const args = lookupArgsSchema.safeParse({ slug, cnpj });
  if (!args.success) return { ok: false, reason: "failed" };

  const result = await lookupCompany(args.data.slug, args.data.cnpj);
  if (result.ok) {
    const { razao_social, cnae, municipio, uf } = result.company;
    return {
      ok: true,
      company: {
        razaoSocial: razao_social,
        atividade: cnae.descricao,
        municipio,
        uf,
      },
    };
  }
  return {
    ok: false,
    reason: result.reason === "not_found" ? "not_found" : "failed",
  };
}
