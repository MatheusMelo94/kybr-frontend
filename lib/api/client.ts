import "server-only";

import type { z } from "zod";

import { env } from "@/lib/env";

import { getClientIp } from "./client-ip";
import { AppError, appErrorFromResponse } from "./errors";

export const DEFAULT_TIMEOUT_MS = 8_000;

type ApiRequest<T> = {
  /** Names the call in logs. The path is never logged: it carries the slug, token or CNPJ. */
  operation: string;
  /** Path under API_BASE_URL, with segments already validated or encoded. */
  path: string;
  method?: "GET" | "POST" | "PUT";
  /** Sent as JSON. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Parses the 2xx body (an empty 204 parses as undefined). */
  schema: z.ZodType<T>;
  /** Sends X-Kybr-Client-IP. Only on uncached, per-request calls (contract X2). */
  forwardClientIp?: boolean;
  timeoutMs?: number;
  cache?: RequestCache;
  next?: RequestInit["next"];
};

export type ApiResult<T> =
  | { ok: true; data: T; status: number; requestId: string | undefined }
  | { ok: false; error: AppError };

const NOT_JSON = Symbol("not JSON");

/**
 * Resolves `path` against API_BASE_URL and refuses anything that would leave
 * the API's origin or its /public/ tree (threat model F01). It catches absolute
 * and protocol-relative URLs, userinfo host swaps, and traversal, including
 * encoded (WHATWG URL resolves "..", "%2e%2e").
 */
function publicApiUrl(path: string): URL {
  const base = new URL(env.API_BASE_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/public/")) {
    throw new Error("Refused API path: outside the API's /public/ tree");
  }
  return url;
}

/** A failure before a full response arrived: the timeout's abort, or the network. */
function transportError(error: unknown): AppError {
  const aborted =
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
  return new AppError({ code: aborted ? "TIMEOUT" : "NETWORK" });
}

/**
 * Calls the Kybr API from the Next server. It never throws for an HTTP,
 * network or schema failure: those come back as `{ ok: false, error }`, and the
 * data function decides what is expected. It does throw for a path outside the
 * API's /public/ tree: that's a bug or an attack, never a runtime condition.
 */
export async function apiRequest<T>(
  request: ApiRequest<T>,
): Promise<ApiResult<T>> {
  const url = publicApiUrl(request.path);
  const headers = new Headers(request.headers);
  headers.set("accept", "application/json");
  if (env.API_BFF_KEY !== undefined)
    headers.set("x-kybr-bff-key", env.API_BFF_KEY);
  if (request.forwardClientIp) {
    const clientIp = await getClientIp();
    if (clientIp !== undefined) headers.set("x-kybr-client-ip", clientIp);
  }
  if (request.body !== undefined)
    headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? "GET",
      headers,
      // Never follow a 3xx: a redirect would carry the BFF key to its target (F01).
      redirect: "error",
      signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      ...(request.body !== undefined && { body: JSON.stringify(request.body) }),
      ...(request.cache !== undefined && { cache: request.cache }),
      ...(request.next !== undefined && { next: request.next }),
    });
  } catch (error) {
    return { ok: false, error: transportError(error) };
  }
  if (!response.ok)
    return { ok: false, error: await appErrorFromResponse(response) };

  let payload: unknown;
  try {
    const text = await response.text();
    payload = text === "" ? undefined : (JSON.parse(text) as unknown);
  } catch (error) {
    if (!(error instanceof SyntaxError))
      return { ok: false, error: transportError(error) };
    payload = NOT_JSON; // fails the schema below, as INVALID_RESPONSE
  }

  const status = response.status;
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const parsed = request.schema.safeParse(payload);
  if (!parsed.success) {
    // Shape only: issue paths and codes, never values (§ Logging & Monitoring).
    console.error("[kybr-api] invalid response", {
      operation: request.operation,
      status,
      requestId,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    });
    return {
      ok: false,
      error: new AppError({ code: "INVALID_RESPONSE", status, requestId }),
    };
  }
  return { ok: true, data: parsed.data, status, requestId };
}
