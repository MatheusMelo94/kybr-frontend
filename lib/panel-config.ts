import "server-only";

import { env } from "@/lib/env";
import { toSafeHttpsUrl, type SafeHttpsUrl } from "@/lib/safe-url";

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

/** The sign-up's legal links (P-U3), checked as https: (loopback http: in local builds). */
export function legalLinks(): {
  termsUrl: SafeHttpsUrl | string;
  privacyUrl: SafeHttpsUrl | string;
  version: string;
} {
  const terms = required(env.LEGAL_TERMS_URL, "LEGAL_TERMS_URL");
  const privacy = required(env.LEGAL_PRIVACY_URL, "LEGAL_PRIVACY_URL");
  return {
    termsUrl: toSafeHttpsUrl(terms) ?? terms,
    privacyUrl: toSafeHttpsUrl(privacy) ?? privacy,
    version: required(env.LEGAL_TERMS_VERSION, "LEGAL_TERMS_VERSION"),
  };
}

/** "Contratar"'s address (P-U4): unset keeps the button hidden. */
export function commercialContactEmail(): string | undefined {
  return env.COMMERCIAL_CONTACT_EMAIL;
}
