import { NextResponse, type NextRequest } from "next/server";

import {
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  buildContentSecurityPolicy,
  generateNonce,
} from "@/lib/csp";
import { env } from "@/lib/env";
import { panelCookieNames } from "@/lib/panel-cookie-names";
import {
  classifyHost,
  hostConfigFromEnv,
  isProtectedPanelPath,
  usesTurnstile,
} from "@/lib/panel-hosts";
import { panelPath } from "@/lib/panel-paths";
import { isLoopbackHostname } from "@/lib/safe-url";

// Host routing, the CSP nonce and the panel's UX headers (ADR-0008, ADR-0009
// rule 6). Routing and UX only; never authorization (§ Routing, Layouts &
// Boundaries): the panel's DAL and actions check the host and the session
// again. It makes no API call and reads no cookie value, only presence.

const hosts = hostConfigFromEnv(env);

/**
 * Where the link host sends every path that isn't the link's: a path no route
 * matches (a leading "_" folder is private in the app router), so the root
 * not-found.tsx answers, with this request's nonce.
 */
const LINK_NOT_FOUND_PATH = "/_kybr/nao-encontrado";

/**
 * Paths both hosts serve as they are (ADR-0008 rule 5). /favicon.ico is the
 * empty 204 route: browsers ask for it on every page (P4-001).
 */
function isShared(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === CSP_REPORT_PATH ||
    pathname === "/favicon.ico"
  );
}

function isLinkPath(pathname: string): boolean {
  return pathname === "/v" || pathname.startsWith("/v/");
}

/**
 * A request for a Flight (RSC) payload, by the Accept header that Server
 * Actions send. Next strips its own rsc / next-router-prefetch headers before
 * middleware runs, so Accept is what's left to tell.
 */
function wantsFlight(request: NextRequest): boolean {
  return (request.headers.get("accept") ?? "").includes("text/x-component");
}

/** The internal path this request renders, or undefined to pass it through. */
function internalPath(
  kind: "panel" | "link",
  pathname: string,
): string | undefined {
  if (kind === "panel") return panelPath(pathname);
  return isLinkPath(pathname) ? undefined : LINK_NOT_FOUND_PATH;
}

/** The header carrying the external path + query to the DAL (for `volta`). Never trusted from the client. */
const PANEL_PATH_HEADER = "x-kybr-panel-path";

/** Local and E2E only: a loopback host behind the local-only flag (ADR-0009 rule 3). */
function isLocalHttp(host: string): boolean {
  return (
    env.API_ALLOW_LOOPBACK_HTTP === "true" &&
    isLoopbackHostname(host.replace(/:\d+$/, ""))
  );
}

/** The panel's own origin: request.nextUrl carries the server's hostname, not the request's. */
function panelOrigin(request: NextRequest, host: string): string {
  return `${request.nextUrl.protocol}//${host}`;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // Health answers on any host: the platform's checks use raw addresses.
  if (pathname === "/api/health") return NextResponse.next();

  const kind = classifyHost(request.headers.get("host"), hosts);
  // Unknown hosts (production *.vercel.app aliases, raw IPs): nothing (P03.1).
  if (kind === "unknown") return new NextResponse(null, { status: 404 });
  if (isShared(pathname)) return NextResponse.next();

  // After a panel Server Action's redirect('/x'), Next re-renders /x in
  // process with a fetch to its own origin, and fetch drops the Host header:
  // locally that origin is the link host. A plain 404 (not a Flight payload)
  // makes Next fall back to a client navigation, which the panel host routes
  // (ADR-0008 spike, T41). A link page never needs a payload from off /v/*.
  if (kind === "link" && !isLinkPath(pathname) && wantsFlight(request))
    return new NextResponse(null, { status: 404 });

  const panel = kind === "panel";
  // classifyHost() matched it against PANEL_HOST or a link host: safe to echo.
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { search } = request.nextUrl;

  // ADR-0009 rule 6: no session cookie on a protected panel path → /entrar.
  // Presence only: the DAL validates it, and the auth pages are never
  // redirected (a stale cookie must not loop).
  if (
    panel &&
    isProtectedPanelPath(pathname) &&
    !request.cookies.has(panelCookieNames(isLocalHttp(host)).session)
  ) {
    const login = new URL("/entrar", panelOrigin(request, host));
    login.searchParams.set("volta", pathname + search);
    return NextResponse.redirect(login, 307);
  }

  const target = internalPath(kind, pathname);
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    ...(panel
      ? { turnstile: usesTurnstile(pathname) }
      : { apiOrigin: new URL(env.API_PUBLIC_BASE_URL).origin }),
    isDev: env.NODE_ENV === "development",
    upgradeInsecureRequests: !isLoopbackHostname(request.nextUrl.hostname),
  });

  // Next reads the nonce from the request's CSP header and stamps it on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);
  requestHeaders.delete(PANEL_PATH_HEADER);
  if (panel) requestHeaders.set(PANEL_PATH_HEADER, pathname + search);

  // Prefetches get the same treatment: middleware can't tell them apart (see
  // wantsFlight), and a CSP header on a Flight payload has no effect.
  const init = { request: { headers: requestHeaders } };
  let response: NextResponse;
  if (target === undefined) {
    response = NextResponse.next(init);
  } else {
    const url = request.nextUrl.clone();
    url.pathname = target;
    response = NextResponse.rewrite(url, init);
  }
  response.headers.set("content-security-policy", policy);
  // The endpoint for the policy's report-to (absolute, as the Reporting API
  // needs). The link's stays as it was on main; the panel's is its own origin.
  const reportOrigin = panel
    ? panelOrigin(request, host)
    : request.nextUrl.origin;
  response.headers.set(
    "reporting-endpoints",
    `${CSP_REPORT_GROUP}="${new URL(CSP_REPORT_PATH, reportOrigin).href}"`,
  );
  if (panel) {
    // Nothing on the panel is cached or indexed (P03.5, P06), and the reset
    // pages never leak their path in a Referer (P04).
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("x-robots-tag", "noindex, nofollow");
    if (pathname === "/senha" || pathname.startsWith("/senha/"))
      response.headers.set("referrer-policy", "no-referrer");
  }
  return response;
}

export const config = {
  // Every request but static assets, prefetches included: host routing must
  // hold for prefetch and RSC requests too (ADR-0008 rule 6, P03.1).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
