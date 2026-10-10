import "server-only";

import { z } from "zod";

import type { ApiResult } from "@/lib/api/client";
import { AppError, type AppErrorCode } from "@/lib/api/errors";
import { cappedCsv } from "@/lib/api/panel/csv-limits";
import { panelRequest, panelStreamRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  reverifyResultSchema,
  sellerListSchema,
  sellerSchema,
  type Seller,
  type SellerList,
} from "@/lib/api/schemas/panel/sellers";
import { maskCnpj } from "@/lib/cnpj";
import { maskCpf } from "@/lib/cpf";
import { reportMarker } from "@/lib/monitoring";
import type { SellerStatus } from "@/lib/panel-api-values";

// Vendedores' data functions (D-S1–D-S5 + C-M8-2–C-M8-5, Pre-Contract),
// through the panel client (no-store forced, P06; the bearer from the DAL;
// the BFF key). Callers have already passed requireSession() (ADR-0011
// Addendum 1); without a session token nothing is sent.
//
// O-F4: every CNPJ is masked here and every CPF-shaped run in a name (MEI,
// X7), so the wire form never reaches a prop. O-F6: the search `q` is never
// logged or reported: the markers carry the operation and the failing
// schema paths only, and the client logs no path or query.

/** The body comes back raw: it's parsed here, so a failure logs shape only (F11). */
const raw = z.unknown();

export type CsvStream = ApiResult<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
}>;

const KEPT: ReadonlySet<AppErrorCode> = new Set([
  "SESSAO_EXPIRADA",
  "SEM_SALDO",
  "REVERIFICACAO_EM_ANDAMENTO",
  "VALOR_INVALIDO",
  "NETWORK",
]);

/**
 * One of the codes Vendedores branches on. A 404 is "not found or not
 * yours" (A-X3, PS8) whatever the body says; a 402 is SEM_SALDO; a timeout
 * is an unknown outcome like a dropped connection (NETWORK, O-F7); anything
 * unexpected is UNAVAILABLE.
 */
function sellerError(error: AppError): AppError {
  const code: AppErrorCode =
    error.status === 404
      ? "SELLER_NAO_ENCONTRADO"
      : error.status === 402
        ? "SEM_SALDO"
        : error.code === "TIMEOUT"
          ? "NETWORK"
          : KEPT.has(error.code)
            ? error.code
            : "UNAVAILABLE";
  if (code === error.code) return error;
  return new AppError({
    code,
    status: error.status,
    requestId: error.requestId,
  });
}

async function token(): Promise<string> {
  const value = await sessionToken();
  if (value === undefined) throw new AppError({ code: "SESSAO_EXPIRADA" });
  return value;
}

/** Parses or throws UNAVAILABLE with SELLER_SCHEMA_INVALID (paths only, F11). */
function parse<T>(schema: z.ZodType<T>, data: unknown, operation: string): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  reportMarker("SELLER_SCHEMA_INVALID", {
    operation,
    paths: [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ]
      .join(",")
      .slice(0, 180),
  });
  throw new AppError({ code: "UNAVAILABLE" });
}

/** A name with any embedded CPF masked (MEI, X7; Security O-F4). */
const maskName = (name: string | null): string | null =>
  name === null ? null : maskCpf(name);

/** O-F4 on a row: the CNPJ and the CPFs in the names. */
function masked<T extends SellerList["itens"][number]>(row: T): T {
  return {
    ...row,
    razao_social: maskName(row.razao_social),
    cnpj: maskCnpj(row.cnpj),
    ...(row.responsavel !== undefined && {
      responsavel: maskCpf(row.responsavel),
    }),
  };
}

/**
 * D-S1: one page of 50, newest verification first. Throws SESSAO_EXPIRADA
 * or UNAVAILABLE (the page's error.tsx).
 */
export async function listSellers(filter: {
  pagina: number;
  status?: SellerStatus | undefined;
  q?: string | undefined;
}): Promise<SellerList> {
  const operation = "sellers";
  const bearer = await token();
  const result = await panelRequest({
    operation,
    path: apiPaths.panel.sellers.list(filter),
    schema: raw,
    sessionToken: bearer,
  });
  if (!result.ok) {
    const error = sellerError(result.error);
    if (error.code === "SESSAO_EXPIRADA") throw error;
    throw new AppError({
      code: "UNAVAILABLE",
      status: error.status,
      requestId: error.requestId,
    });
  }
  const page = parse(sellerListSchema, result.data, operation);
  return { ...page, itens: page.itens.map(masked) };
}

/**
 * D-S2: the seller, its latest verification (M6's shape), the history and
 * the open case. Throws SESSAO_EXPIRADA, SELLER_NAO_ENCONTRADO (a foreign
 * or unknown id, AC 58) or UNAVAILABLE.
 */
export async function getSeller(id: string): Promise<Seller> {
  const operation = "seller";
  const bearer = await token();
  const result = await panelRequest({
    operation,
    path: apiPaths.panel.sellers.get(id),
    schema: raw,
    sessionToken: bearer,
  });
  if (!result.ok) {
    const error = sellerError(result.error);
    if (
      error.code === "SESSAO_EXPIRADA" ||
      error.code === "SELLER_NAO_ENCONTRADO"
    )
      throw error;
    throw new AppError({
      code: "UNAVAILABLE",
      status: error.status,
      requestId: error.requestId,
    });
  }
  return masked(parse(sellerSchema, result.data, operation));
}

/**
 * D-S3 (A-X7): asks for a new lookup with the client's Idempotency-Key
 * unchanged (D6: the key lives in SellersProvider). SEM_SALDO and
 * REVERIFICACAO_EM_ANDAMENTO are definitive; NETWORK and UNAVAILABLE are an
 * unknown outcome: the client keeps the key and re-reads (O-F7, M6C-01).
 */
export async function reverifySeller(
  id: string,
  idempotencyKey: string,
): Promise<void> {
  const operation = "seller-reverify";
  const bearer = await token();
  const result = await panelRequest({
    operation,
    path: apiPaths.panel.sellers.reverify(id),
    method: "POST",
    body: {},
    schema: raw,
    sessionToken: bearer,
    headers: { "idempotency-key": idempotencyKey },
  });
  if (!result.ok) throw sellerError(result.error);
  parse(reverifyResultSchema, result.data, operation);
}

/** A CSV export, as a capped stream (shared 4 MiB CSV_MAX_BYTES, O-F5). */
async function streamCsv(operation: string, path: string): Promise<CsvStream> {
  const bearer = await sessionToken();
  if (bearer === undefined)
    return { ok: false, error: new AppError({ code: "SESSAO_EXPIRADA" }) };
  const result = await panelStreamRequest({
    operation,
    path,
    accept: "text/csv",
    sessionToken: bearer,
    // The export is audited with the client IP (CR-P10).
    forwardClientIp: true,
  });
  if (!result.ok) return { ok: false, error: sellerError(result.error) };
  return cappedCsv(result.response);
}

/** D-S4: the sellers CSV for the current filter and search (C-M8-5). */
export async function streamSellersCsv(filter: {
  status?: SellerStatus | undefined;
  q?: string | undefined;
}): Promise<CsvStream> {
  return streamCsv("sellers-csv", apiPaths.panel.sellers.export(filter));
}

/** D-S5: the audit trail over de..ate (calendar days, C-M8-5). */
export async function streamAuditCsv(range: {
  de: string;
  ate: string;
}): Promise<CsvStream> {
  return streamCsv("audit-csv", apiPaths.panel.auditCsv(range));
}
