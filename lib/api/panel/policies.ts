import "server-only";

import { z } from "zod";

import { AppError, type AppErrorCode } from "@/lib/api/errors";
import { panelRequest } from "@/lib/api/panel/client";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import { policySchema, type Policy } from "@/lib/api/schemas/panel/policies";
import { reportMarker } from "@/lib/monitoring";
import type {
  DocumentoTipo,
  PolicyAcao,
  PolicyChave,
} from "@/lib/panel-api-values";

// Regras' data functions (D-R1 + C-M8-6, Pre-Contract), through the panel
// client (no-store forced, P06; the bearer from the DAL; the BFF key).
// Callers have already passed requireSession() and pass the session's
// category, never the client's.

/** The body comes back raw: it's parsed here, so a failure logs shape only (F11). */
const raw = z.unknown();

/** What PUT sends: each rule's key, action and (recente only) days. */
export type PolicyDraft = {
  versao: number;
  regras: {
    chave: PolicyChave;
    acao: PolicyAcao;
    dias?: number | undefined;
  }[];
  documentos_habilitados: DocumentoTipo[];
};

const KEPT: ReadonlySet<AppErrorCode> = new Set([
  "SESSAO_EXPIRADA",
  "POLITICA_DESATUALIZADA",
  "SEM_DOCUMENTO_HABILITADO",
  "VALOR_INVALIDO",
  "NETWORK",
]);

/** A timeout is NETWORK (unknown); anything unexpected is UNAVAILABLE. */
function policyError(error: AppError): AppError {
  const code: AppErrorCode =
    error.code === "TIMEOUT"
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

/** Parses or throws UNAVAILABLE with POLICY_SCHEMA_INVALID (paths only, F11). */
function parse(data: unknown, operation: string): Policy {
  const parsed = policySchema.safeParse(data);
  if (parsed.success) return parsed.data;
  reportMarker("POLICY_SCHEMA_INVALID", {
    operation,
    paths: [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ]
      .join(",")
      .slice(0, 180),
  });
  throw new AppError({ code: "UNAVAILABLE" });
}

async function send(
  operation: string,
  categoria: string,
  draft?: PolicyDraft,
): Promise<Policy> {
  const token = await sessionToken();
  if (token === undefined) throw new AppError({ code: "SESSAO_EXPIRADA" });
  const result = await panelRequest({
    operation,
    path: apiPaths.panel.policy(categoria),
    ...(draft !== undefined && { method: "PUT" as const, body: draft }),
    schema: raw,
    sessionToken: token,
  });
  if (!result.ok) throw policyError(result.error);
  return parse(result.data, operation);
}

/**
 * D-R1: the workspace's policy. Throws SESSAO_EXPIRADA or UNAVAILABLE (the
 * page's error.tsx). An action outside a rule's acoes_permitidas fails the
 * parse (O-F7).
 */
export async function getPolicy(categoria: string): Promise<Policy> {
  try {
    return await send("policy", categoria);
  } catch (error) {
    if (error instanceof AppError && error.code !== "SESSAO_EXPIRADA")
      throw new AppError({
        code: "UNAVAILABLE",
        status: error.status,
        requestId: error.requestId,
      });
    throw error;
  }
}

/**
 * D-R1 PUT: the whole policy with the versao it was read at. A stale versao
 * is POLITICA_DESATUALIZADA (never retried or merged, O-F7);
 * SEM_DOCUMENTO_HABILITADO and VALOR_INVALIDO are the backend's own checks.
 */
export async function savePolicy(
  categoria: string,
  draft: PolicyDraft,
): Promise<Policy> {
  return send("policy-save", categoria, draft);
}
