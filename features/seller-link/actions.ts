"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { deriveCaseView } from "@/features/seller-link/case-view";
import type { CaseViewKey, CompanySummary } from "@/features/seller-link/types";
import {
  contactEmailSchema,
  fieldIssues,
  verifySchema,
  type EmailIssue,
  type FieldIssues,
} from "@/features/seller-link/schemas";
import { isValidSlug, isValidToken } from "@/lib/api/path";
import {
  createVerification,
  getPublicCase,
  getPublicLink,
  lookupCompany,
  saveCaseContact,
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
 * Whether D1 says the link is live. It's the page's cached read (60 s), so
 * for a slug whose form just loaded it costs no API call.
 */
async function isCachedAsLive(slug: string): Promise<boolean> {
  try {
    return (await getPublicLink(slug)).ok;
  } catch {
    return false; // getPublicLink logged it
  }
}

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
      // The link was disabled after the form loaded. If its info is cached as
      // live (60 s), drop it, so the page re-renders as Link not found
      // (AC 14). An unknown slug has nothing stale to purge, so it never
      // reaches revalidateTag (security finding M2-07).
      if (await isCachedAsLive(slug)) revalidateTag(`public-link:${slug}`);
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
    // An unknown or disabled link is not_found too. No cache purge here: the
    // page renders Link not found from D4's answer whatever the cached D1
    // says, and a purge would let any random slug cost extra backend calls
    // and a re-render (security finding M2-07).
    if (!result.ok) return { ok: false, reason: "not_found" };
    return {
      ok: true,
      viewKey: deriveCaseView(result.publicCase, Date.now()).viewKey,
    };
  } catch {
    // getPublicCase already logged it, by shape (5xx, timeout, bad response).
    return { ok: false, reason: "failed" };
  }
}

export type SaveContactEmailResult =
  | { ok: true }
  | { ok: false; code: "EMAIL_INVALIDO"; issue: EmailIssue }
  | { ok: false; code: "CASO_DECIDIDO" | "CASO_NAO_ENCONTRADO" | "UNAVAILABLE" };

const NOT_FOUND = { ok: false, code: "CASO_NAO_ENCONTRADO" } as const;

/**
 * Saves the seller's contact e-mail (contract D5; DDR-0001), from the e-mail
 * block on *quase lá* and *em análise*. The address is validated with the
 * schema the block uses before any API call, and never logged. A case decided
 * while the page was open is CASO_DECIDIDO (F06a): the block then refreshes to
 * the decided result.
 */
export async function saveContactEmail(
  input: unknown,
): Promise<SaveContactEmailResult> {
  const envelope = caseArgsSchema.safeParse(input);
  if (!envelope.success) return NOT_FOUND;
  const fields = contactEmailSchema.safeParse(input);
  if (!fields.success) {
    const issue = fieldIssue(fields.error.issues);
    return { ok: false, code: "EMAIL_INVALIDO", issue };
  }

  const { slug, token } = envelope.data;
  const result = await saveCaseContact(slug, token, fields.data.email);
  if (result.ok) return { ok: true };
  switch (result.reason) {
    case "invalid_email":
      return { ok: false, code: "EMAIL_INVALIDO", issue: "invalid" };
    case "decided":
      return { ok: false, code: "CASO_DECIDIDO" };
    case "not_found":
      return NOT_FOUND;
    case "failed":
      return { ok: false, code: "UNAVAILABLE" };
  }
}

function fieldIssue(issues: readonly { message: string }[]): EmailIssue {
  return issues[0]?.message === "empty" ? "empty" : "invalid";
}
