import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { ApiResult } from "@/lib/api/client";
import { AppError, type AppErrorCode } from "@/lib/api/errors";
import { panelRequest, panelStreamRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  caseListSchema,
  caseSchema,
  newCasesSchema,
  requestDocumentsResultSchema,
  type Case,
  type CaseList,
} from "@/lib/api/schemas/panel/cases";
import { maskCnpj } from "@/lib/cnpj";
import { reportMarker } from "@/lib/monitoring";
import type {
  CaseTabEstado,
  DecisaoTipo,
  DocumentoTipo,
  MotivoCodigo,
} from "@/lib/panel-api-values";

// The Fila's data functions (D-C1–D-C5 + C-M6-1/2, Pre-Contract). Every call
// goes through the panel client (no-store forced, P06; the bearer from the
// DAL; the BFF key). Callers have already passed requireSession() (ADR-0011
// Addendum 1); without a session token nothing is sent. Failures throw an
// AppError with one of the codes the Fila branches on (plan-m6 § 3.2):
// CASO_NAO_ENCONTRADO, CASO_JA_DECIDIDO, SESSAO_EXPIRADA, the 422 codes,
// NETWORK (the outcome is unknown) or UNAVAILABLE (everything else).

/** F12: the cursor chain's hard cap, if the backend caps `limit` (C-M6-2). */
export const CASE_CHAIN_MAX_CALLS = 8;

/** D-C5: the proof's size cap (C-M6-9). */
export const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024;

/** The body comes back raw: it's parsed here, so a failure logs shape only (F11). */
const raw = z.unknown();

const KEPT: ReadonlySet<AppErrorCode> = new Set([
  "SESSAO_EXPIRADA",
  "CASO_NAO_ENCONTRADO",
  "CASO_JA_DECIDIDO",
  "RECURSO_NAO_ENCONTRADO",
  "MOTIVO_OBRIGATORIO",
  "DOCUMENTO_NAO_HABILITADO",
  "VALOR_INVALIDO",
  "NETWORK",
]);

/**
 * One of the codes the Fila branches on. A 404 is "not found or not yours"
 * (A-X3, PC9) whatever the body says; a timeout is an unknown outcome like a
 * dropped connection (NETWORK); anything unexpected is UNAVAILABLE.
 */
function caseError(error: AppError, notFound: AppErrorCode): AppError {
  const code: AppErrorCode =
    error.status === 404
      ? notFound
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
    decididoEm: error.decididoEm,
    decisao: error.decisao,
  });
}

type CaseRequest = Omit<
  Parameters<typeof panelRequest<unknown>>[0],
  "sessionToken" | "schema"
>;

async function send(
  request: CaseRequest,
  notFound: AppErrorCode = "CASO_NAO_ENCONTRADO",
): Promise<unknown> {
  const token = await sessionToken();
  if (token === undefined) throw new AppError({ code: "SESSAO_EXPIRADA" });
  const result: ApiResult<unknown> = await panelRequest({
    ...request,
    schema: raw,
    sessionToken: token,
  });
  if (!result.ok) throw caseError(result.error, notFound);
  return result.data;
}

/**
 * Parses a response; a failure throws UNAVAILABLE and reports
 * CASE_SCHEMA_INVALID with the operation, the case id and the failing
 * paths, never ZodError's message or the received values (F11).
 */
function parse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: { operation: string; caseId?: string },
): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  reportMarker("CASE_SCHEMA_INVALID", {
    ...context,
    paths: [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ]
      .join(",")
      .slice(0, 180),
  });
  throw new AppError({ code: "UNAVAILABLE" });
}

/** F8: the raw response had a link_vendedor that the schema dropped. */
function markDroppedLink(
  rawLink: unknown,
  parsedLink: string | undefined,
  context: { operation: string; caseId: string },
): void {
  if (rawLink !== undefined && parsedLink === undefined)
    reportMarker("LINK_VENDEDOR_INVALID", context);
}

function rawField(data: unknown, ...path: string[]): unknown {
  let value = data;
  for (const key of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function parseCase(data: unknown, operation: string, caseId: string): Case {
  const record = parse(caseSchema, data, { operation, caseId });
  markDroppedLink(rawField(data, "link_vendedor"), record.link_vendedor, {
    operation,
    caseId,
  });
  return record;
}

/**
 * D-C1: one request with `limit` (≤ 200, C-M6-2). If the backend answers
 * fewer with a cursor (it caps `limit`), the rest comes through the cursor
 * chain, at most CASE_CHAIN_MAX_CALLS calls (F12), merged into one page.
 */
export async function listCases(filter: {
  estado: CaseTabEstado;
  limit: number;
}): Promise<CaseList> {
  const operation = "cases-list";
  const first = parse(
    caseListSchema,
    await send({ operation, path: apiPaths.panel.cases.list(filter) }),
    { operation },
  );
  const itens = [...first.itens];
  let cursor = first.proximo_cursor;
  for (
    let calls = 1;
    calls < CASE_CHAIN_MAX_CALLS &&
    cursor !== null &&
    itens.length < filter.limit;
    calls++
  ) {
    const page = parse(
      caseListSchema,
      await send({
        operation,
        path: apiPaths.panel.cases.list({
          estado: filter.estado,
          limit: filter.limit - itens.length,
          cursor,
        }),
      }),
      { operation },
    );
    itens.push(...page.itens);
    cursor = page.proximo_cursor;
  }
  return {
    ...first,
    itens: itens.slice(0, filter.limit),
    proximo_cursor: cursor,
  };
}

/**
 * D-C1 for the Fila's pages, the CNPJs masked (F11), one read per request for (estado, limit) (React
 * cache(): the list pane and the empty detail pane share it). A failed read
 * is a result the list renders (ListError, AC 28) instead of error.tsx;
 * SESSAO_EXPIRADA still throws.
 */
export const listCasesForPage = cache(
  async (
    estado: CaseTabEstado,
    limit: number,
  ): Promise<{ ok: true; page: CaseList } | { ok: false }> => {
    try {
      const page = await listCases({ estado, limit });
      return {
        ok: true,
        page: {
          ...page,
          itens: page.itens.map((item) => ({
            ...item,
            cnpj: maskCnpj(item.cnpj),
          })),
        },
      };
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === "UNAVAILABLE" || error.code === "NETWORK")
      )
        return { ok: false };
      throw error;
    }
  },
);

/** D-C2, with the documents' signed URLs: for the route handlers only (F1). */
export async function getCase(id: string): Promise<Case> {
  const operation = "case";
  return parseCase(
    await send({ operation, path: apiPaths.panel.cases.get(id) }),
    operation,
    id,
  );
}

/** A case document as the page sees it: no signed URL (F1). */
export type CaseDocumentView = {
  id: string;
  tipo: DocumentoTipo;
  enviadoEm: string;
};

/** The page's projection of D-C2: no document URL (F1), the CNPJs masked (F11). */
export type CaseView = Omit<Case, "documentos" | "cnpj" | "seller"> & {
  cnpj: string;
  seller: Omit<Case["seller"], "cnpj"> & { cnpj: string };
  documentos?: CaseDocumentView[];
};

function project(record: Case): CaseView {
  const { documentos, cnpj, seller, ...rest } = record;
  return {
    ...rest,
    cnpj: maskCnpj(cnpj),
    seller: { ...seller, cnpj: maskCnpj(seller.cnpj) },
    ...(documentos && {
      documentos: documentos.map((doc) => ({
        id: doc.id,
        tipo: doc.tipo,
        enviadoEm: doc.enviado_em,
      })),
    }),
  };
}

/**
 * D-C2 for /fila/[caseId]. A failed read is a result the page renders
 * (CaseDetailError) instead of error.tsx: UNAVAILABLE or NETWORK only.
 * CASO_NAO_ENCONTRADO (notFound) and SESSAO_EXPIRADA (/entrar) still throw.
 */
export async function getCaseForPage(
  id: string,
): Promise<
  { ok: true; case: CaseView } | { ok: false; code: "UNAVAILABLE" | "NETWORK" }
> {
  try {
    return { ok: true, case: project(await getCase(id)) };
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.code === "UNAVAILABLE" || error.code === "NETWORK")
    )
      return { ok: false, code: error.code };
    throw error;
  }
}

/**
 * D-C6: a document's short-lived signed URL, read fresh from the case (the
 * origin allowlist is the route handler's, F2). If the backend adds F3's
 * mint endpoint (C-M6-10), only this function changes.
 */
export async function getDocumentUrl(
  caseId: string,
  docId: string,
): Promise<string> {
  const record = await getCase(caseId);
  if (record.documentos === undefined)
    throw new AppError({ code: "UNAVAILABLE" });
  const doc = record.documentos.find((candidate) => candidate.id === docId);
  if (!doc) throw new AppError({ code: "RECURSO_NAO_ENCONTRADO" });
  return doc.url;
}

/**
 * C-M6-1: the cases that entered `aberto` after `desde`. A poll: X-Kybr-Poll
 * (it mustn't slide the idle timer, F10) and the caller's poll timeout
 * (POLL_TIMEOUT_MS, 4 s), as getBatch takes it.
 */
export async function countNewCases(
  desde: string,
  options: { pollTimeoutMs: number },
): Promise<number> {
  const operation = "cases-new";
  const data = await send({
    operation,
    path: apiPaths.panel.cases.newCount(desde),
    headers: { "x-kybr-poll": "1" },
    timeoutMs: options.pollTimeoutMs,
  });
  return parse(newCasesSchema, data, { operation }).novos;
}

/** D-C3 (A-X7: one Idempotency-Key per intent, F5). */
export async function decideCase(
  id: string,
  decision: {
    decisao: DecisaoTipo;
    motivoCodigo?: MotivoCodigo | undefined;
    notaVendedor?: string | undefined;
  },
  idempotencyKey: string,
): Promise<Case> {
  const operation = "case-decide";
  const data = await send({
    operation,
    path: apiPaths.panel.cases.decide(id),
    method: "POST",
    body: {
      decisao: decision.decisao,
      ...(decision.motivoCodigo !== undefined && {
        motivo_codigo: decision.motivoCodigo,
      }),
      ...(decision.notaVendedor !== undefined && {
        nota_vendedor: decision.notaVendedor,
      }),
    },
    headers: { "idempotency-key": idempotencyKey },
  });
  return parseCase(data, operation, id);
}

/** D-C4 (A-X7). `linkVendedor` only when it passes F8 (else dropped and marked). */
export async function requestDocuments(
  id: string,
  request: { tipos: DocumentoTipo[]; notaVendedor?: string | undefined },
  idempotencyKey: string,
): Promise<{ case: Case; linkVendedor?: string }> {
  const operation = "case-request-documents";
  const data = await send({
    operation,
    path: apiPaths.panel.cases.requestDocuments(id),
    method: "POST",
    body: {
      tipos: request.tipos,
      ...(request.notaVendedor !== undefined && {
        nota_vendedor: request.notaVendedor,
      }),
    },
    headers: { "idempotency-key": idempotencyKey },
  });
  const result = parse(requestDocumentsResultSchema, data, {
    operation,
    caseId: id,
  });
  markDroppedLink(rawField(data, "link_vendedor"), result.link_vendedor, {
    operation,
    caseId: id,
  });
  markDroppedLink(
    rawField(data, "case", "link_vendedor"),
    result.case.link_vendedor,
    { operation, caseId: id },
  );
  return {
    case: result.case,
    ...(result.link_vendedor !== undefined && {
      linkVendedor: result.link_vendedor,
    }),
  };
}

/**
 * D-C5: the proof PDF, buffered then validated (F12): application/pdf, a
 * body that starts with %PDF-, at most 5 MB; anything else is UNAVAILABLE.
 * The caller reads the case first and passes its verification id (C-M6-9).
 */
export async function streamCertificate(
  verificationId: string,
): Promise<Uint8Array> {
  const operation = "case-certificate";
  const path = apiPaths.panel.cases.certificate(verificationId);
  const token = await sessionToken();
  if (token === undefined) throw new AppError({ code: "SESSAO_EXPIRADA" });
  const result = await panelStreamRequest({
    operation,
    path,
    accept: "application/pdf",
    sessionToken: token,
  });
  if (!result.ok) throw caseError(result.error, "RECURSO_NAO_ENCONTRADO");
  const { response } = result;
  const unavailable = () => {
    void response.body?.cancel();
    return new AppError({ code: "UNAVAILABLE", status: response.status });
  };
  const type = response.headers.get("content-type") ?? "";
  if (!/^application\/pdf(?:;|$)/i.test(type) || response.body === null)
    throw unavailable();
  if (
    Number(response.headers.get("content-length") ?? "0") >
    CERTIFICATE_MAX_BYTES
  )
    throw unavailable();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CERTIFICATE_MAX_BYTES) {
      void reader.cancel();
      throw new AppError({ code: "UNAVAILABLE", status: response.status });
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (new TextDecoder().decode(body.slice(0, 5)) !== "%PDF-")
    throw new AppError({ code: "UNAVAILABLE", status: response.status });
  return body;
}
