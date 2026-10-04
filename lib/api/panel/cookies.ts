import "server-only";

import { cookies, headers } from "next/headers";
import { z } from "zod";

import { env } from "@/lib/env";
import {
  panelCookieNames,
  type PanelCookieNames,
} from "@/lib/panel-cookie-names";
import { isLoopbackHostname } from "@/lib/safe-url";

// The panel's cookies (ADR-0009 rules 3 and 10; P02, P19). Written only by
// Server Actions, only from values the API returned. Host-only (no Domain),
// and __Host- prefixed so a sibling subdomain can't toss its own copy.

const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60; // U-P6: 7 days absolute
const SIGNUP_SECONDS = 30 * 60;
const TOKEN = /^[\x21-\x7e]{16,512}$/;

/**
 * Local and E2E only: WebKit refuses a Secure cookie on http loopback, so on
 * a loopback host, behind the local-only API_ALLOW_LOOPBACK_HTTP flag (never
 * set in a deployment), the cookies drop Secure and with it the __Host-
 * prefix. Reads use the same rule, so production never reads a plain name.
 */
async function isLocalHttp(): Promise<boolean> {
  if (env.API_ALLOW_LOOPBACK_HTTP !== "true") return false;
  const host = (await headers()).get("host") ?? "";
  return isLoopbackHostname(host.replace(/:\d+$/, ""));
}

async function names(): Promise<PanelCookieNames> {
  return panelCookieNames(await isLocalHttp());
}

function options(secure: boolean, maxAge: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  } as const;
}

/** The session id from the cookie, if it looks like one. */
export async function readSessionToken(): Promise<string | undefined> {
  const { session } = await names();
  const value = (await cookies()).get(session)?.value;
  return value !== undefined && TOKEN.test(value) ? value : undefined;
}

/** Sets the session from the API's { id, expira_em } (Max-Age ≤ 7 days). */
export async function setSessionCookie(sessao: {
  id: string;
  expira_em: string;
}): Promise<void> {
  const { session, secure } = await names();
  const seconds = Math.floor(
    (Date.parse(sessao.expira_em) - Date.now()) / 1000,
  );
  const maxAge = Math.max(
    0,
    Math.min(Number.isFinite(seconds) ? seconds : 0, MAX_SESSION_SECONDS),
  );
  (await cookies()).set(session, sessao.id, options(secure, maxAge));
}

export async function deleteSessionCookie(): Promise<void> {
  const { session, secure } = await names();
  (await cookies()).set(session, "", options(secure, 0));
}

const pendingSignupSchema = z.object({
  ticket: z.string().regex(TOKEN),
  nome: z.string().max(120),
  workspace: z.string().max(80),
  email: z.string().max(254),
});

/** The pending sign-up: the API's ticket and the prefill, never the password. */
export type PendingSignup = z.infer<typeof pendingSignupSchema>;

export async function setSignupCookie(pending: PendingSignup): Promise<void> {
  const { signup, secure } = await names();
  // Only these four fields, whatever the caller passed.
  const { ticket, nome, workspace, email } = pending;
  const value = Buffer.from(
    JSON.stringify({ ticket, nome, workspace, email }),
  ).toString("base64url");
  (await cookies()).set(signup, value, options(secure, SIGNUP_SECONDS));
}

export async function readSignupCookie(): Promise<PendingSignup | null> {
  const { signup } = await names();
  const value = (await cookies()).get(signup)?.value;
  if (!value) return null;
  try {
    const parsed = pendingSignupSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function deleteSignupCookie(): Promise<void> {
  const { signup, secure } = await names();
  (await cookies()).set(signup, "", options(secure, 0));
}
