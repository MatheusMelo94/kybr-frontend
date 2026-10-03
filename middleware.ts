import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";
import { env } from "@/lib/env";
import { isLoopbackHostname } from "@/lib/safe-url";

// CSP nonce only. Routing and UX; never authorization
// (§ Routing, Layouts & Boundaries). Host routing joins with the panel (ADR-0002).
export function middleware(request: NextRequest): NextResponse {
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

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: static assets need no nonce, and prefetches reuse the page's.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
