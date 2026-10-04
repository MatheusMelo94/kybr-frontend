import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { readSessionToken } from "@/lib/api/panel/cookies";
import { panelRequest } from "@/lib/api/panel/client";
import { assertPanelHost } from "@/lib/api/panel/host";
import { apiPaths } from "@/lib/api/path";
import { meSchema, type Me } from "@/lib/api/schemas/panel/me";
import { safeReturnPath } from "@/lib/safe-return-path";

// The panel's Data Access Layer (ADR-0009 rule 5; SEC § Authorization (DAL)).
// Every panel data function and action calls getSession()/requireSession()
// or uses sessionToken(). Client components get projections, never the id.

export type { Me };

/**
 * The current session's /me, or null (no cookie, or the API says 401). One
 * GET /v1/me per request: React cache() is the only memoization allowed for
 * panel data (P06). Any other failure throws to the route's error boundary.
 */
export const getSession = cache(async (): Promise<Me | null> => {
  await assertPanelHost();
  const token = await readSessionToken();
  if (token === undefined) return null;
  const result = await panelRequest({
    operation: "me",
    path: apiPaths.panel.me(),
    schema: meSchema,
    sessionToken: token,
  });
  if (result.ok) return result.data;
  if (result.error.code === "SESSAO_EXPIRADA") return null;
  throw result.error;
});

/** The login URL that brings Renata back to the current panel path. */
export async function sessionExpiredUrl(): Promise<string> {
  // Set by middleware from the external path + query; never the client's.
  const volta = safeReturnPath((await headers()).get("x-kybr-panel-path"));
  const query = new URLSearchParams({ motivo: "sessao" });
  if (volta !== null) query.set("volta", volta);
  return `/entrar?${query.toString()}`;
}

/** The session, or a redirect to /entrar?motivo=sessao&volta=… (AC 7). */
export async function requireSession(): Promise<Me> {
  const me = await getSession();
  if (me === null) redirect(await sessionExpiredUrl());
  return me;
}

/** The session id for an authenticated API call (after the host check). */
export async function sessionToken(): Promise<string | undefined> {
  await assertPanelHost();
  return readSessionToken();
}
