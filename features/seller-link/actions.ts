"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { deriveCaseView } from "@/features/seller-link/case-view";
import type { CaseViewKey, CompanySummary } from "@/features/seller-link/types";
import {
  fieldIssues,
  verifySchema,
  type FieldIssues,
} from "@/features/seller-link/schemas";
import { isValidSlug, isValidToken } from "@/lib/api/path";
import {
  createVerification,
  getPublicCase,
  lookupCompany,
} from "@/lib/api/public-link";
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

// The envelope around the form's fields. The fields themselves go through the
// shared verifySchema, so the action re-validates exactly what the client did.
const startArgsSchema = z.object({
  slug: z.string(),
  // F17: a UUID only, checked before it can become a request header.
  idempotencyKey: z.uuid(),
});

export type StartVerificationResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid"; fields: FieldIssues }
  | { ok: false; reason: "link_not_found" }
  | {
      ok: false;
      reason: "limit_cnpj" | "limit_generic";
      retryAfterSeconds: number | undefined;
    }
  | { ok: false; reason: "failed" };

/**
 * Starts a verification (contract D3). It re-validates every field with the
 * schema the form uses (the CNPJ through lib/cnpj), never trusts the client's
 * props, and returns a result union. It never throws for an expected failure,
 * and logs no PII (the API client logs shape only).
 */
export async function startVerification(
  input: unknown,
): Promise<StartVerificationResult> {
  const envelope = startArgsSchema.safeParse(input);
  if (!envelope.success) return { ok: false, reason: "failed" };
  const { slug, idempotencyKey } = envelope.data;
  if (!isValidSlug(slug)) return { ok: false, reason: "link_not_found" };

  const fields = verifySchema.safeParse(input);
  if (!fields.success)
    return {
      ok: false,
      reason: "invalid",
      fields: fieldIssues(fields.error.issues),
    };

  const result = await createVerification(slug, fields.data, idempotencyKey);
  if (result.ok) return { ok: true, token: result.token };
  switch (result.reason) {
    case "link_not_found":
      // The link was disabled after the form loaded. Drop its cached info
      // (60 s), so the page re-renders as Link not found (AC 14).
      revalidateTag(`public-link:${slug}`);
      return { ok: false, reason: "link_not_found" };
    case "invalid_field":
      return {
        ok: false,
        reason: "invalid",
        fields: { [result.field]: "invalid" },
      };
    case "limit_cnpj":
    case "limit_generic":
      return {
        ok: false,
        reason: result.reason,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    case "failed":
      return { ok: false, reason: "failed" };
  }
}

const caseArgsSchema = z.object({
  slug: z.string().refine(isValidSlug),
  token: z.string().refine(isValidToken),
});

// Half the page read's 8 s: a late check is simply replaced by the next one
// (plan § 4).
const STATUS_CHECK_TIMEOUT_MS = 4_000;

export type PollCaseViewResult =
  | { ok: true; viewKey: CaseViewKey }
  | { ok: false; reason: "not_found" | "failed" };

/**
 * Read-only status check for the case page (ADR-0004a; tech-design § 3 rule
 * 1): called by CaseLiveStatus on a timer. It returns only the view key,
 * derived by the same function and clock as the page, never the case itself.
 * An unknown, foreign or malformed token is `not_found` (the page then
 * refreshes to Case not found). Any other failure is `failed`, never a throw:
 * a thrown action reaches the client as a network failure.
 */
export async function pollCaseViewAction(
  slug: unknown,
  token: unknown,
): Promise<PollCaseViewResult> {
  const args = caseArgsSchema.safeParse({ slug, token });
  if (!args.success) return { ok: false, reason: "not_found" };

  try {
    const result = await getPublicCase(args.data.slug, args.data.token, {
      timeoutMs: STATUS_CHECK_TIMEOUT_MS,
    });
    if (!result.ok) {
      // The link was disabled while the case was open. Drop its cached info
      // (60 s), so the refresh renders Link not found (QA plan Q3).
      if (result.reason === "link_not_found")
        revalidateTag(`public-link:${args.data.slug}`);
      return { ok: false, reason: "not_found" };
    }
    return {
      ok: true,
      viewKey: deriveCaseView(result.publicCase, Date.now()).viewKey,
    };
  } catch {
    // getPublicCase already logged it, by shape (5xx, timeout, bad response).
    return { ok: false, reason: "failed" };
  }
}
