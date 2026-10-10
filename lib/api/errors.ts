import { z } from "zod";

import { DECISAO_TIPOS, MOTIVO_CODIGOS } from "@/lib/panel-api-values";

/** Stable codes from the X1 error envelope (seller-link contract-request.md D7; ops-panel A-X2). */
export const API_ERROR_CODES = [
  "LINK_NAO_ENCONTRADO",
  "EMPRESA_NAO_ENCONTRADA",
  "CNPJ_INVALIDO",
  "RESPONSAVEL_INVALIDO",
  "LIMITE_CONSULTAS",
  "LIMITE_CNPJ",
  "LIMITE_TENTATIVAS",
  "CASO_NAO_ENCONTRADO",
  "EMAIL_INVALIDO",
  "ARQUIVO_GRANDE",
  "FORMATO_INVALIDO",
  "CASO_DECIDIDO",
  "AUTOFILL_DESATIVADO", // D2 kill switch (contract X6)
  // The panel's (ops-panel contract-request.md A-X2, M4)
  "SESSAO_EXPIRADA",
  "TURNSTILE_REQUERIDO",
  "TURNSTILE_INVALIDO",
  "TESTE_INDISPONIVEL",
  "TESTE_PAUSADO",
  "CREDENCIAIS_INVALIDAS",
  "EMAIL_NAO_CONFIRMADO",
  "EMAIL_EM_USO",
  "SENHA_FRACA",
  "VALOR_INVALIDO",
  "CODIGO_INCORRETO",
  "CODIGO_EXPIRADO",
  "TOKEN_INVALIDO",
  "RECURSO_NAO_ENCONTRADO",
  // Batches (A-X2, M5)
  "LOTE_NAO_ENCONTRADO",
  "SEM_SALDO",
  "MUITAS_LINHAS",
  "SEM_CNPJ_VALIDO",
  "LOTE_EM_ANDAMENTO",
  // Cases (A-X2, M6)
  "CASO_JA_DECIDIDO",
  "MOTIVO_OBRIGATORIO",
  "DOCUMENTO_NAO_HABILITADO",
  // Account (C-M8-7, M8): a wrong current password is a 403, never a 401,
  // so the session survives (Security O-F1).
  "SENHA_ATUAL_INCORRETA",
  // Sellers and policies (C-M8-3/4/6, M8). A 404 on a seller path is
  // SELLER_NAO_ENCONTRADO (not found or not yours, like the batches').
  "SELLER_NAO_ENCONTRADO",
  "REVERIFICACAO_EM_ANDAMENTO",
  "POLITICA_DESATUALIZADA",
  "SEM_DOCUMENTO_HABILITADO",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * What the UI branches on. Beyond the API codes:
 * - UNAVAILABLE: a 5xx without a known code
 * - NETWORK: the API couldn't be reached
 * - TIMEOUT: the call was aborted
 * - INVALID_RESPONSE: a 2xx body failed its schema
 * - UNKNOWN: any other non-2xx
 */
export type AppErrorCode =
  | ApiErrorCode
  | "UNAVAILABLE"
  | "NETWORK"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

type AppErrorInit = {
  code: AppErrorCode;
  status?: number | undefined;
  requestId?: string | undefined;
  retryAfterSeconds?: number | undefined;
  field?: string | undefined;
  signupTicket?: string | undefined;
  reenviarEm?: string | undefined;
  disponiveis?: number | undefined;
  decididoEm?: string | undefined;
  decisao?: DecisaoAnterior | undefined;
};

/** D-C3/D-C4 409 CASO_JA_DECIDIDO: the decision already on the case (C-M6-7). */
export type DecisaoAnterior = {
  tipo: (typeof DECISAO_TIPOS)[number];
  motivoCodigo?: (typeof MOTIVO_CODIGOS)[number] | undefined;
};

/**
 * A typed Kybr API failure. The backend's `message` is never kept: the UI maps
 * `code` to spec copy, and Error.message names only the code.
 */
export class AppError extends Error {
  override readonly name = "AppError";
  readonly code: AppErrorCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly field: string | undefined;
  /** D-A4 EMAIL_NAO_CONFIRMADO: the pending account's ticket (server-side only). */
  readonly signupTicket: string | undefined;
  /** D-A4 EMAIL_NAO_CONFIRMADO: when the next resend unlocks (ISO 8601). */
  readonly reenviarEm: string | undefined;
  /** D-B1 / D-B7 402 SEM_SALDO: the checks still available (the over-allowance state). */
  readonly disponiveis: number | undefined;
  /** D-C3 / D-C4 409 CASO_JA_DECIDIDO: when the case was decided (ISO 8601). */
  readonly decididoEm: string | undefined;
  /** D-C3 / D-C4 409 CASO_JA_DECIDIDO: the decision it already has. */
  readonly decisao: DecisaoAnterior | undefined;

  constructor({
    code,
    status,
    requestId,
    retryAfterSeconds,
    field,
    signupTicket,
    reenviarEm,
    disponiveis,
    decididoEm,
    decisao,
  }: AppErrorInit) {
    super(`Kybr API error: ${code}`);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
    this.field = field;
    this.signupTicket = signupTicket;
    this.reenviarEm = reenviarEm;
    this.disponiveis = disponiveis;
    this.decididoEm = decididoEm;
    this.decisao = decisao;
  }
}

// `message` is deliberately not read.
const errorEnvelopeSchema = z.object({
  code: z.string(),
  field: z.string().optional(),
  // D-A4: the 403 EMAIL_NAO_CONFIRMADO carries the pending account's ticket.
  signup_ticket: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,512}$/)
    .optional()
    .catch(undefined),
  reenviar_em: z.string().max(64).optional().catch(undefined),
  // D-B1 / D-B7: 402 SEM_SALDO carries the remaining checks.
  disponiveis: z.number().int().nonnegative().optional().catch(undefined),
  // D-C3 / D-C4: 409 CASO_JA_DECIDIDO carries the existing decision (C-M6-7).
  decidido_em: z.iso.datetime({ offset: true }).optional().catch(undefined),
  decisao: z
    .object({
      tipo: z.enum(DECISAO_TIPOS),
      motivo_codigo: z.enum(MOTIVO_CODIGOS).optional(),
    })
    .optional()
    .catch(undefined),
});

function isApiErrorCode(code: string | undefined): code is ApiErrorCode {
  return (
    code !== undefined && (API_ERROR_CODES as readonly string[]).includes(code)
  );
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

/** Maps a non-2xx response (X1 envelope, X-Request-Id, Retry-After) to an AppError. */
export async function appErrorFromResponse(
  response: Response,
): Promise<AppError> {
  const envelope = errorEnvelopeSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  const rawCode = envelope.success ? envelope.data.code : undefined;
  const fallback = response.status >= 500 ? "UNAVAILABLE" : "UNKNOWN";
  return new AppError({
    code: isApiErrorCode(rawCode) ? rawCode : fallback,
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? undefined,
    retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
    field: envelope.success ? envelope.data.field : undefined,
    signupTicket: envelope.success ? envelope.data.signup_ticket : undefined,
    reenviarEm: envelope.success ? envelope.data.reenviar_em : undefined,
    disponiveis: envelope.success ? envelope.data.disponiveis : undefined,
    decididoEm: envelope.success ? envelope.data.decidido_em : undefined,
    decisao:
      envelope.success && envelope.data.decisao
        ? {
            tipo: envelope.data.decisao.tipo,
            motivoCodigo: envelope.data.decisao.motivo_codigo,
          }
        : undefined,
  });
}
