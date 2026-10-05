import "server-only";

import { env } from "@/lib/env";
import { isLoopbackHostname } from "@/lib/safe-url";

// The panel's runtime config for its pages (ADR-0009). env-schema requires
// every value whenever PANEL_HOST is set, and a panel page renders only on
// the panel host, so a missing value here is a bug, not a state.

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Panel config missing: ${name}`);
  return value;
}

/** Public: the widget's site key, passed as a prop (never NEXT_PUBLIC_*). */
export function turnstileSiteKey(): string {
  return required(env.TURNSTILE_SITE_KEY, "TURNSTILE_SITE_KEY");
}

/**
 * The sign-up's legal links (P-U3). env-schema already checked them: https:
 * in production, a loopback http: only in local production builds.
 */
export function legalLinks(): { termsUrl: string; privacyUrl: string } {
  return {
    termsUrl: required(env.LEGAL_TERMS_URL, "LEGAL_TERMS_URL"),
    privacyUrl: required(env.LEGAL_PRIVACY_URL, "LEGAL_PRIVACY_URL"),
  };
}

/** "Contratar"'s address (P-U4): unset keeps the button hidden. */
export function commercialContactEmail(): string | undefined {
  return env.COMMERCIAL_CONTACT_EMAIL;
}

/** "Contratar"'s mailto: (the plan block, the Conta menu, PlanBanner); unset → hidden. */
export function contratarHref(): string | undefined {
  const email = commercialContactEmail();
  return email === undefined ? undefined : `mailto:${email}`;
}

/**
 * The panel's own origin, for absolute metadata URLs (the share image):
 * https:, or http: on loopback behind the local-only flag (ADR-0009 rule 3).
 * Undefined with the panel off, when no panel page renders.
 */
export function panelOrigin(): URL | undefined {
  const host = env.PANEL_HOST;
  if (host === undefined) return undefined;
  const local =
    env.API_ALLOW_LOOPBACK_HTTP === "true" &&
    isLoopbackHostname(host.replace(/:\d+$/, ""));
  return new URL(`${local ? "http" : "https"}://${host}`);
}
