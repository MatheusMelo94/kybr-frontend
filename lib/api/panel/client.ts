import "server-only";

import type { z } from "zod";

import {
  sendApiRequest,
  sendApiStreamRequest,
  type ApiResult,
} from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { reportMarker } from "@/lib/monitoring";

// The panel's API client (ADR-0009 rule 4, threat model P18), separate from
// the link's: its own path guard, the session as a bearer token, and no
// caching at all (P06). It shares the link's transport.

type PanelRequest<T> = {
  /** Names the call in logs. Paths and headers are never logged. */
  operation: string;
  /** Under /v1/, from apiPaths.panel (segments validated and encoded). */
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  schema: z.ZodType<T>;
  /** The session id from the cookie (DAL only). Sent as Authorization: Bearer. */
  sessionToken?: string;
  /** Sends X-Kybr-Client-IP: on the auth calls the backend rate-limits (X2). */
  forwardClientIp?: boolean;
  /** 8 s by default; polls pass 4 s (plan § 2.3). */
  timeoutMs?: number;
};

/**
 * Resolves `path` against API_BASE_URL and refuses anything outside the API's
 * /v1/ tree, or inside /v1/public/ (the link's). WHATWG URL resolves "..",
 * "%2e%2e", absolute and protocol-relative URLs before the check, so each
 * of those lands outside and throws.
 */
function panelApiUrl(path: string): URL {
  const base = new URL(env.API_BASE_URL);
  const url = new URL(path, base);
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith("/v1/") ||
    url.pathname.startsWith("/v1/public/") ||
    url.pathname.includes("//")
  ) {
    throw new Error("Refused API path: outside the API's /v1/ tree");
  }
  return url;
}

/**
 * Calls the Kybr API for the panel. Every call is `cache: "no-store"` (no
 * caller can opt out: one workspace's data must never be served to another,
 * P06), and a 401 on a call that carried the session becomes SESSAO_EXPIRADA,
 * so the DAL and the actions send Renata back to /entrar (ADR-0009 rule 7).
 */
export async function panelRequest<T>(
  request: PanelRequest<T>,
): Promise<ApiResult<T>> {
  const url = panelApiUrl(request.path);
  const headers = new Headers(request.headers);
  if (request.sessionToken !== undefined)
    headers.set("authorization", `Bearer ${request.sessionToken}`);

  const result = await sendApiRequest({
    operation: request.operation,
    url,
    schema: request.schema,
    headers: Object.fromEntries(headers),
    cache: "no-store",
    ...(request.method !== undefined && { method: request.method }),
    ...(request.body !== undefined && { body: request.body }),
    ...(request.forwardClientIp !== undefined && {
      forwardClientIp: request.forwardClientIp,
    }),
    ...(request.timeoutMs !== undefined && { timeoutMs: request.timeoutMs }),
  });
  // Shape-only markers (P16): the operation's name, never a value.
  if (!result.ok) {
    const { operation } = request;
    if (result.error.status === 429)
      reportMarker("AUTH_RATE_LIMITED", { operation });
    else if (result.error.code === "TURNSTILE_INVALIDO")
      reportMarker("TURNSTILE_FAILED", { operation });
    else if (result.error.status === 401 && request.sessionToken !== undefined)
      reportMarker("SESSION_REJECTED", { operation });
  }
  // A 401 on an authenticated call is an expired or revoked session. On the
  // pre-session auth calls it's their own code (CREDENCIAIS_INVALIDAS).
  if (
    !result.ok &&
    result.error.status === 401 &&
    request.sessionToken !== undefined
  ) {
    return {
      ok: false,
      error: new AppError({
        code: "SESSAO_EXPIRADA",
        status: 401,
        requestId: result.error.requestId,
      }),
    };
  }
  return result;
}

/**
 * A panel call whose body the caller reads itself (the CSV downloads, D-B4):
 * the same /v1/ guard, bearer, no-store and 401 → SESSAO_EXPIRADA mapping as
 * panelRequest, without a schema.
 */
export async function panelStreamRequest(
  request: Omit<PanelRequest<unknown>, "schema" | "body" | "method"> & {
    accept: string;
  },
): Promise<{ ok: true; response: Response } | { ok: false; error: AppError }> {
  const url = panelApiUrl(request.path);
  const headers = new Headers(request.headers);
  if (request.sessionToken !== undefined)
    headers.set("authorization", `Bearer ${request.sessionToken}`);
  const result = await sendApiStreamRequest(
    {
      operation: request.operation,
      url,
      headers: Object.fromEntries(headers),
      cache: "no-store",
      ...(request.forwardClientIp !== undefined && {
        forwardClientIp: request.forwardClientIp,
      }),
      ...(request.timeoutMs !== undefined && { timeoutMs: request.timeoutMs }),
    },
    request.accept,
  );
  if (
    !result.ok &&
    result.error.status === 401 &&
    request.sessionToken !== undefined
  ) {
    reportMarker("SESSION_REJECTED", { operation: request.operation });
    return {
      ok: false,
      error: new AppError({
        code: "SESSAO_EXPIRADA",
        status: 401,
        requestId: result.error.requestId,
      }),
    };
  }
  return result;
}
