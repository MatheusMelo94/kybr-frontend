import { HttpResponse, type JsonBodyType } from "msw";

import {
  ERROR_SENTINEL,
  PANEL_RETRY_AFTER_SECONDS,
  TURNSTILE_TOKENS,
} from "../../factories/panel.ts";
import { recordCall } from "../panel-store.ts";

// Replies and request plumbing shared by the panel's handlers (A-X1, A-X2).

function requestId(): Record<string, string> {
  return { "X-Request-Id": crypto.randomUUID() };
}

export function ok(
  body: JsonBodyType,
  status = 200,
): HttpResponse<JsonBodyType> {
  return HttpResponse.json(body, { status, headers: requestId() });
}

export function noContent(): HttpResponse<null> {
  return new HttpResponse(null, { status: 204, headers: requestId() });
}

/** The A-X2 envelope with the AC 67 sentinel message, X-Request-Id, and Retry-After on a 429. */
export function apiError(
  status: number,
  code: string,
  extra: Record<string, string> = {},
): HttpResponse<JsonBodyType> {
  return HttpResponse.json(
    { code, message: ERROR_SENTINEL, ...extra },
    {
      status,
      headers: {
        ...requestId(),
        ...(status === 429 && {
          "Retry-After": String(PANEL_RETRY_AFTER_SECONDS),
        }),
      },
    },
  );
}

/** PA16: the connection drops (the HTTP mock destroys the socket). */
export function networkDrop(): Response {
  return HttpResponse.error();
}

export type Incoming = {
  body: Record<string, unknown>;
  token: string | undefined;
  /** X-Kybr-Client-IP, as the Next server forwarded it (QA G2). */
  ip: string | undefined;
  /** Set when the request must be refused before any handling. */
  refused?: HttpResponse<JsonBodyType>;
};

/**
 * Reads the JSON body and the bearer token, logs the call (path + query, the
 * body's e-mail and Turnstile token, never the password), and refuses a
 * request without the BFF key (contract A-X1: every /v1 call carries it).
 */
export async function incoming(request: Request): Promise<Incoming> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method !== "GET") {
    const parsed = (await request.json().catch(() => ({}))) as unknown;
    if (typeof parsed === "object" && parsed !== null)
      body = parsed as Record<string, unknown>;
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = /^Bearer (\S+)$/.exec(auth)?.[1];
  const ip = request.headers.get("x-kybr-client-ip") ?? undefined;
  const bodyKeys = Object.keys(body).sort();
  recordCall({
    method: request.method,
    path: url.pathname + url.search,
    ...(typeof body.email === "string" && { email: body.email.toLowerCase() }),
    ...(typeof body.turnstile === "string" && { turnstile: body.turnstile }),
    ...(ip !== undefined && { ip }),
    ...(bodyKeys.length > 0 && { bodyKeys }),
    authorized: token !== undefined,
  });
  const result: Incoming = { body, token, ip };
  if (!request.headers.get("x-kybr-bff-key"))
    result.refused = apiError(403, "BFF_KEY_AUSENTE");
  return result;
}

/** 400 TURNSTILE_INVALIDO unless the body carries the accepted test token (PA18). */
export function turnstileProblem(
  body: Record<string, unknown>,
): HttpResponse<JsonBodyType> | undefined {
  return body.turnstile === TURNSTILE_TOKENS.pass
    ? undefined
    : apiError(400, "TURNSTILE_INVALIDO");
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
