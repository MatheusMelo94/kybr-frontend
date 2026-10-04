import { z } from "zod";

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

  constructor({
    code,
    status,
    requestId,
    retryAfterSeconds,
    field,
  }: AppErrorInit) {
    super(`Kybr API error: ${code}`);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
    this.field = field;
  }
}

// `message` is deliberately not read.
const errorEnvelopeSchema = z.object({
  code: z.string(),
  field: z.string().optional(),
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
  });
}
