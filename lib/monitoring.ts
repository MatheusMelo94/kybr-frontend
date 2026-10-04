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
 * A shape-only marker for something to alert on (e.g. REDIRECT_REFUSED,
 * finding 0003): logged, and sent as an error tagged `marker:<name>`.
 * `context` holds names and codes only, never values.
 */
export function reportMarker(
  marker: string,
  context: Record<string, string>,
): void {
  console.error(`[kybr] ${marker}`, context);
  Sentry.captureMessage(marker, {
    level: "error",
    tags: { marker, ...context },
  });
}

/**
 * CSP violations from the collector (SEC § Logging & Monitoring: CSP reports).
 * A warning each; an expected pre-hydration submit (finding 0004) is info,
 * tagged, so it never pages anyone.
 */
export function reportCspViolations(violations: CspViolation[]): void {
  for (const violation of violations) {
    const documentUrl = scrubUrl(violation.documentUrl);
    const blocked = violation.blocked.includes("://")
      ? scrubUrl(violation.blocked)
      : violation.blocked;
    const expected = violation.expected ? "pre-hydration-submit" : "no";
    console.warn("[kybr] CSP_VIOLATION", {
      directive: violation.directive,
      blocked,
      expected,
    });
    Sentry.captureMessage("csp-violation", {
      level: violation.expected ? "info" : "warning",
      tags: {
        marker: "CSP_VIOLATION",
        directive: violation.directive,
        disposition: violation.disposition,
        expected,
      },
      extra: { documentUrl, blocked },
    });
  }
}
