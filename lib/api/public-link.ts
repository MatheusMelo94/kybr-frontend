import "server-only";

import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";

import { apiRequest } from "./client";
import type { AppError } from "./errors";
import { apiPaths, isValidSlug, isValidToken } from "./path";
import {
  companyLookupSchema,
  publicCaseSchema,
  publicLinkSchema,
  verificationSchema,
  type CompanyLookup,
  type PublicCase,
  type PublicLink,
} from "./schemas/public-link";

// Data functions for the seller link (contract D1–D4). There's no session: the
// slug and the token are the access, so every parameter is validated before an
// API call (plan § 4), and paths come only from lib/api/path.ts (F01).

/** Logs an unexpected failure once, by shape. INVALID_RESPONSE was logged by the client. */
function logUnexpected(operation: string, error: AppError): void {
  if (error.code === "INVALID_RESPONSE") return;
  console.error("[kybr-api] unexpected failure", {
    operation,
    code: error.code,
    status: error.status,
    requestId: error.requestId,
  });
}

export type PublicLinkResult =
  { ok: true; link: PublicLink } | { ok: false; reason: "not_found" };

/**
 * D1. Shared, non-personal data: cached 60 s per slug, and no per-request
 * headers (no client IP), so the cache key stays stable. Unknown, disabled or
 * malformed slugs are not-found. Anything else unexpected throws, for the
 * route's error boundary.
 */
export async function getPublicLink(slug: string): Promise<PublicLinkResult> {
  if (!isValidSlug(slug)) return { ok: false, reason: "not_found" };
  const result = await apiRequest({
    operation: "getPublicLink",
    path: apiPaths.publicLink(slug),
    schema: publicLinkSchema,
    next: { revalidate: 60, tags: [`public-link:${slug}`] },
  });
  if (result.ok) return { ok: true, link: result.data };
  if (result.error.code === "LINK_NAO_ENCONTRADO")
    return { ok: false, reason: "not_found" };
  logUnexpected("getPublicLink", result.error);
  throw result.error;
}

export type CompanyLookupResult =
  | { ok: true; company: CompanyLookup }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number | undefined }
  | { ok: false; reason: "failed" };

function isCanonicalCnpj(cnpj: string): boolean {
  return normalizeCnpj(cnpj) === cnpj && validateCnpj(cnpj) === "ok";
}

/**
 * D2. Interaction-triggered, so every failure is a value (the form shows
 * form.lookup.failed and lets the seller continue). Personal and per request:
 * no-store, with the client IP.
 */
export async function lookupCompany(
  slug: string,
  cnpj: string,
): Promise<CompanyLookupResult> {
  if (!isValidSlug(slug) || !isCanonicalCnpj(cnpj))
    return { ok: false, reason: "failed" };
  const result = await apiRequest({
    operation: "lookupCompany",
    path: apiPaths.lookup(slug, cnpj),
    schema: companyLookupSchema,
    cache: "no-store",
    forwardClientIp: true,
  });
  if (result.ok) return { ok: true, company: result.data };
  switch (result.error.code) {
    case "EMPRESA_NAO_ENCONTRADA":
      return { ok: false, reason: "not_found" };
    case "LIMITE_CONSULTAS":
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterSeconds: result.error.retryAfterSeconds,
      };
    case "AUTOFILL_DESATIVADO":
      return { ok: false, reason: "failed" };
    default:
      logUnexpected("lookupCompany", result.error);
      return { ok: false, reason: "failed" };
  }
}

export type VerificationInput = {
  /** The canonical CNPJ: 14 uppercase alphanumerics (contract X5). */
  cnpj: string;
  responsavel: string;
  ref?: string | undefined;
  ext_id?: string | undefined;
};

export type VerificationResult =
  | { ok: true; token: string }
  | { ok: false; reason: "link_not_found" }
  | {
      ok: false;
      reason: "limit_cnpj" | "limit_generic";
      retryAfterSeconds: number | undefined;
    }
  | { ok: false; reason: "invalid_field"; field: "cnpj" | "responsavel" }
  | { ok: false; reason: "failed" };

/**
 * D3. A write: the Server Action (T18) validates the input and the idempotency
 * key first. Unknown codes and 5xx map to `failed`, which the form shows as the
 * network copy (plan § 1, assumption 5).
 */
export async function createVerification(
  slug: string,
  input: VerificationInput,
  idempotencyKey: string,
): Promise<VerificationResult> {
  if (!isValidSlug(slug)) return { ok: false, reason: "link_not_found" };
  const result = await apiRequest({
    operation: "createVerification",
    path: apiPaths.verify(slug),
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": idempotencyKey },
    schema: verificationSchema,
    cache: "no-store",
    forwardClientIp: true,
  });
  if (result.ok) return { ok: true, token: result.data.token };

  const { code, retryAfterSeconds } = result.error;
  switch (code) {
    case "LINK_NAO_ENCONTRADO":
      return { ok: false, reason: "link_not_found" };
    case "LIMITE_CNPJ":
      return { ok: false, reason: "limit_cnpj", retryAfterSeconds };
    case "LIMITE_TENTATIVAS":
      return { ok: false, reason: "limit_generic", retryAfterSeconds };
    case "CNPJ_INVALIDO":
      return { ok: false, reason: "invalid_field", field: "cnpj" };
    case "RESPONSAVEL_INVALIDO":
      return { ok: false, reason: "invalid_field", field: "responsavel" };
    default:
      logUnexpected("createVerification", result.error);
      return { ok: false, reason: "failed" };
  }
}

export type PublicCaseResult =
  { ok: true; publicCase: PublicCase } | { ok: false; reason: "not_found" };

/**
 * D4. Personal and live: no-store, with the client IP. An unknown token, a
 * token from another slug, an unknown slug and a malformed slug or token are
 * all the same not-found, so nothing leaks whether a case exists (SEC § Error
 * Responses). A 5xx or a response that breaks the schema throws, for the case
 * route's error boundary.
 */
export async function getPublicCase(
  slug: string,
  token: string,
): Promise<PublicCaseResult> {
  if (!isValidSlug(slug) || !isValidToken(token))
    return { ok: false, reason: "not_found" };
  const result = await apiRequest({
    operation: "getPublicCase",
    path: apiPaths.publicCase(slug, token),
    schema: publicCaseSchema,
    cache: "no-store",
    forwardClientIp: true,
  });
  if (result.ok) return { ok: true, publicCase: result.data };
  if (
    result.error.code === "CASO_NAO_ENCONTRADO" ||
    result.error.code === "LINK_NAO_ENCONTRADO"
  )
    return { ok: false, reason: "not_found" };
  logUnexpected("getPublicCase", result.error);
  throw result.error;
}
