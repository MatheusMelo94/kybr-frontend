import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

import type { CspViolation } from "./csp-report";
import { scrubText, scrubUrl } from "./scrub";

export { scrubUrl } from "./scrub";

// Server-side error monitoring (T34a; threat model F10; U-D). Sentry runs on
// the Node.js server only: no browser SDK, no instrumentation-client.ts and no
// withSentryConfig, so /v/* client chunks carry no Sentry code (ADR-0003).
// Nothing that identifies a seller leaves the server: no request bodies or
// Server Action arguments, cookies, headers, client IP, query strings or case
// tokens (SEC § Logging & Monitoring).

/** Collect nothing automatically (Sentry 11 `dataCollection`). */
export const NO_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
} satisfies NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"];

const KEPT_CONTEXTS = ["runtime", "os", "trace", "app", "device", "culture"];

/**
 * Sentry's beforeSend: keeps the error's type, scrubbed message and stack, and
 * the request's method and token-free path. Drops everything else that could
 * carry seller data.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, exception, contexts, message, transaction } = event;
  // Dropped whole: who the user is, what happened before, and free-form extras.
  const rest: ErrorEvent = { ...event };
  delete rest.user;
  delete rest.breadcrumbs;
  delete rest.extra;
  return {
    ...rest,
    ...(message !== undefined && { message: scrubText(message) }),
    ...(transaction !== undefined && { transaction: scrubText(transaction) }),
    ...(request !== undefined && {
      request: {
        ...(request.method !== undefined && { method: request.method }),
        ...(request.url !== undefined && { url: scrubUrl(request.url) }),
      },
    }),
    ...(exception?.values !== undefined && {
      exception: {
        values: exception.values.map((value) => ({
          ...value,
          ...(value.value !== undefined && { value: scrubText(value.value) }),
          ...(value.stacktrace?.frames !== undefined && {
            stacktrace: {
              ...value.stacktrace,
              // A frame's local variables can hold anything.
              frames: value.stacktrace.frames.map((frame) => {
                const kept = { ...frame };
                delete kept.vars;
                return kept;
              }),
            },
          }),
        })),
      },
    }),
    ...(contexts !== undefined && {
      contexts: Object.fromEntries(
        Object.entries(contexts).filter(([name]) =>
          KEPT_CONTEXTS.includes(name),
        ),
      ),
    }),
  };
}

/** Starts Sentry on the Node.js server. Without a DSN (optional, QA G12), nothing is sent. */
export function initMonitoring(dsn: string | undefined): void {
  if (dsn === undefined) return;
  Sentry.init({
    dsn,
    // Sentry 11's replacement for sendDefaultPii: false. Nothing about the
    // request or the seller is collected; beforeSend scrubs what's left.
    dataCollection: NO_DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: () => null,
    tracesSampleRate: 0,
  });
}

/**
 * The markers DevOps alerts on (bursts: credential stuffing, P01 G8).
 * - REDIRECT_REFUSED: the API answered a 3xx (finding 0003).
 * - The panel's (threat model P16): AUTH_RATE_LIMITED (a 429),
 *   PANEL_HOST_MISMATCH (a panel route or action off the panel host),
 *   SESSION_REJECTED (a sent session got a 401), TURNSTILE_FAILED (the API
 *   refused the token).
 * - The Fila's (M6, F8, F11): CASE_SCHEMA_INVALID (a case response failed
 *   its schema; paths only), LINK_VENDEDOR_INVALID (a seller link failed
 *   parseLinkVendedor and was dropped), DOCUMENT_ORIGIN_REFUSED (a signed
 *   document URL off PANEL_DOCUMENTS_ORIGIN, F2; the case id only).
 * - The Monitoramento's (M7, F11, A-F2): ALERT_SCHEMA_INVALID (an alerts or
 *   monitoring response failed its schema; paths only).
 */
export const MARKERS = [
  "REDIRECT_REFUSED",
  "AUTH_RATE_LIMITED",
  "PANEL_HOST_MISMATCH",
  "SESSION_REJECTED",
  "TURNSTILE_FAILED",
  "CASE_SCHEMA_INVALID",
  "LINK_VENDEDOR_INVALID",
  "DOCUMENT_ORIGIN_REFUSED",
  "ALERT_SCHEMA_INVALID",
] as const;

export type Marker = (typeof MARKERS)[number];

/** Sentry events each marker may send per minute, per server instance (M4-08). */
export const MARKER_EVENTS_PER_MINUTE = 20;

// Each marker's window on this instance, like the CSP collector's (M3-01).
const markerWindows = new Map<
  Marker,
  { start: number; sent: number; full: boolean }
>();

/** True when this marker may go to Sentry now; logs once when its budget runs out. */
function admitMarker(marker: Marker): boolean {
  const now = Date.now();
  let window = markerWindows.get(marker);
  if (
    window === undefined ||
    now < window.start ||
    now - window.start >= 60_000
  ) {
    window = { start: now, sent: 0, full: false };
    markerWindows.set(marker, window);
  }
  if (window.sent >= MARKER_EVENTS_PER_MINUTE) {
    if (!window.full) {
      window.full = true;
      console.warn("[kybr] MARKER_BUDGET", {
        marker,
        perMinute: String(MARKER_EVENTS_PER_MINUTE),
      });
    }
    return false;
  }
  window.sent += 1;
  return true;
}

/**
 * A shape-only marker for something to alert on: always logged (the log
 * keeps the count for alerting), and sent as an error tagged
 * `marker:<name>` at most MARKER_EVENTS_PER_MINUTE times a minute per
 * marker, since anyone can trigger some of them (M4-08). `context` holds
 * names and codes only, never values (no e-mail, name, token, ticket or host).
 */
export function reportMarker(
  marker: Marker,
  context: Record<string, string>,
): void {
  console.error(`[kybr] ${marker}`, context);
  if (!admitMarker(marker)) return;
  Sentry.captureMessage(marker, {
    level: "error",
    tags: { marker, ...context },
  });
}

/** Sentry drops a tag value longer than this. */
const MAX_TAG_LENGTH = 200;

/** A scrubbed URL's path: no origin, token, query or fragment. */
function scrubbedPath(url: string): string {
  return scrubUrl(url).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") || "/";
}

/** Sentry events the CSP collector may send per minute, per server instance (M3-01). */
export const CSP_EVENTS_PER_MINUTE = 30;
const MINUTE = 60_000;

// One instance's CSP window: what it sent this minute, and whether it has
// said so once the budget ran out. Module state, so it's per instance.
const cspWindow = { start: 0, sent: new Set<string>(), full: false };

/** True when this violation may be sent now: under budget, and new this minute. */
function admitCsp(key: string): boolean {
  const now = Date.now();
  if (now < cspWindow.start || now - cspWindow.start >= MINUTE) {
    cspWindow.start = now;
    cspWindow.sent.clear();
    cspWindow.full = false;
  }
  if (cspWindow.sent.has(key)) return false;
  if (cspWindow.sent.size >= CSP_EVENTS_PER_MINUTE) {
    if (!cspWindow.full) {
      cspWindow.full = true;
      console.warn("[kybr] CSP_VIOLATION_BUDGET", {
        perMinute: String(CSP_EVENTS_PER_MINUTE),
      });
    }
    return false;
  }
  cspWindow.sent.add(key);
  return true;
}

/**
 * CSP violations from the collector (SEC § Logging & Monitoring: CSP reports).
 * A warning each; an expected pre-hydration submit (finding 0004) is info,
 * tagged, so it never pages anyone. The collector is public, so each instance
 * sends at most CSP_EVENTS_PER_MINUTE events a minute, and the same directive
 * and blocked URI once (M3-01); the log line is shape only.
 */
export function reportCspViolations(violations: CspViolation[]): void {
  for (const violation of violations) {
    const blocked = violation.blocked.includes("://")
      ? scrubUrl(violation.blocked)
      : violation.blocked;
    if (!admitCsp(`${violation.directive} ${blocked}`)) continue;
    const expected = violation.expected ? "pre-hydration-submit" : "no";
    console.warn("[kybr] CSP_VIOLATION", {
      directive: violation.directive,
      disposition: violation.disposition,
      expected,
    });
    Sentry.captureMessage("csp-violation", {
      level: violation.expected ? "info" : "warning",
      tags: {
        marker: "CSP_VIOLATION",
        directive: violation.directive,
        disposition: violation.disposition,
        expected,
        // Tags, not `extra`: scrubEvent drops `extra` whole (M3-03).
        blocked: blocked.slice(0, MAX_TAG_LENGTH),
        document_path: scrubbedPath(violation.documentUrl).slice(
          0,
          MAX_TAG_LENGTH,
        ),
      },
    });
  }
}
