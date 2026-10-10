import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { AppError } from "@/lib/api/errors";
import { readSessionToken } from "@/lib/api/panel/cookies";
import { panelRequest } from "@/lib/api/panel/client";
import { assertPanelHost } from "@/lib/api/panel/host";
import { apiPaths } from "@/lib/api/path";
import { meSchema, type Me } from "@/lib/api/schemas/panel/me";
import { safeReturnPath } from "@/lib/safe-return-path";

// The panel's Data Access Layer (ADR-0009 rule 5; SEC § Authorization (DAL)).
// Pages, layouts and actions check the session with requireSession();
// sessionToken() only attaches the bearer inside lib/api/panel/*. Client
// components get projections, never the id.

export type { Me };

/**
 * The current session's /me, or null (no cookie, or the API says 401). One
 * GET /v1/me per request: React cache() is the only memoization allowed for
 * panel data (P06). Any other failure throws to the route's error boundary.
 * With `pollTimeoutMs` it serves a background poll: X-Kybr-Poll: 1, so it
 * doesn't slide the 12 h idle session (QA plan Q2, M4-02), and the poll's
 * short timeout.
 */
export const getSession = cache(
  async (pollTimeoutMs?: number): Promise<Me | null> => {
    await assertPanelHost();
    const token = await readSessionToken();
    if (token === undefined) return null;
    const result = await panelRequest({
      operation: pollTimeoutMs === undefined ? "me" : "shell-status",
      path: apiPaths.panel.me(),
      schema: meSchema,
      sessionToken: token,
      ...(pollTimeoutMs !== undefined && {
        headers: { "x-kybr-poll": "1" },
        timeoutMs: pollTimeoutMs,
      }),
    });
    if (result.ok) return result.data;
    if (result.error.code === "SESSAO_EXPIRADA") return null;
    throw result.error;
  },
);

/** The login URL that brings Renata back to the current panel path. */
export async function sessionExpiredUrl(): Promise<string> {
  // Set by middleware from the external path + query; never the client's.
  const volta = safeReturnPath((await headers()).get("x-kybr-panel-path"));
  const query = new URLSearchParams({ motivo: "sessao" });
  if (volta !== null) query.set("volta", volta);
  return `/entrar?${query.toString()}`;
}

/**
 * The session check for pages, layouts and every session action (ADR-0011
 * note): the session, or a redirect to /entrar?motivo=sessao&volta=… (AC 7).
 * With `onMissing: 'result'` (ADR-0011 Addendum 2: session Server Actions)
 * the same full check runs (cookie, /me with the bearer, schema), and a
 * missing or expired session throws AppError('SESSAO_EXPIRADA') instead, for
 * the action to return through sessionExpiredResult(): navigations
 * redirect, actions return. Other failures keep their own codes.
 */
export async function requireSession(
  options: { pollTimeoutMs?: number; onMissing?: "redirect" | "result" } = {},
): Promise<Me> {
  const me = await getSession(options.pollTimeoutMs);
  if (me !== null) return me;
  if (options.onMissing === "result")
    throw new AppError({ code: "SESSAO_EXPIRADA" });
  redirect(await sessionExpiredUrl());
}

export type SessionExpiredResult = { ok: false; code: "SESSAO_EXPIRADA" };

/**
 * An action's catch for requireSession({ onMissing: 'result' }): only the
 * typed AppError('SESSAO_EXPIRADA') becomes the result; anything else
 * (notFound(), a redirect, another AppError, a bug) is rethrown as is
 * (ADR-0011 Addendum 2, decision 7: no catch-all).
 */
export function sessionExpiredResult(error: unknown): SessionExpiredResult {
  if (error instanceof AppError && error.code === "SESSAO_EXPIRADA")
    return { ok: false, code: "SESSAO_EXPIRADA" };
  throw error;
}

/**
 * The session id for an authenticated API call (after the host check).
 * Internal to lib/api/panel/*: never the session check (ADR-0011 note).
 */
export async function sessionToken(): Promise<string | undefined> {
  await assertPanelHost();
  return readSessionToken();
}
