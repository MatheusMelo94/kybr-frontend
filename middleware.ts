import { NextResponse, type NextRequest } from "next/server";

import {
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  buildContentSecurityPolicy,
  generateNonce,
} from "@/lib/csp";
import { env } from "@/lib/env";
import { classifyHost, hostConfigFromEnv } from "@/lib/panel-hosts";
import { panelPath } from "@/lib/panel-paths";
import { isLoopbackHostname } from "@/lib/safe-url";

// Host routing and the CSP nonce (ADR-0008). Routing and UX only; never
// authorization (§ Routing, Layouts & Boundaries): the panel's DAL and actions
// check the host again (assertPanelHost).

const hosts = hostConfigFromEnv(env);

/**
 * Where the link host sends every path that isn't the link's: a path no route
 * matches (a leading "_" folder is private in the app router), so the root
 * not-found.tsx answers, with this request's nonce.
 */
const LINK_NOT_FOUND_PATH = "/_kybr/nao-encontrado";

/** Paths both hosts serve as they are (ADR-0008 rule 5). */
function isShared(pathname: string): boolean {
  return pathname.startsWith("/_next/") || pathname === CSP_REPORT_PATH;
}

function isLinkPath(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/v" ||
    pathname.startsWith("/v/")
  );
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

  const target = internalPath(kind, pathname);
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    apiOrigin: new URL(env.API_PUBLIC_BASE_URL).origin,
    isDev: env.NODE_ENV === "development",
    upgradeInsecureRequests: !isLoopbackHostname(request.nextUrl.hostname),
  });

  // Next reads the nonce from the request's CSP header and stamps it on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

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
  // The endpoint for the policy's report-to (absolute, as the Reporting API needs).
  response.headers.set(
    "reporting-endpoints",
    `${CSP_REPORT_GROUP}="${new URL(CSP_REPORT_PATH, request.nextUrl.origin).href}"`,
  );
  return response;
}

export const config = {
  // Every request but static assets, prefetches included: host routing must
  // hold for prefetch and RSC requests too (ADR-0008 rule 6, P03.1).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
