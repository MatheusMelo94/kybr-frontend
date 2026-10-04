import "server-only";

// The only place Kybr API paths and queries are built (threat model F01). Every
// segment must match its contract pattern, and is encoded, before it goes into
// a request that carries the BFF key. Anything else throws, so it never reaches
// fetch.

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/; // contract X3
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/; // contract X3
const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/; // contract X5 wire format

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function isValidToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

function segment(kind: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value))
    throw new Error(`Refused API path segment: invalid ${kind}`);
  return encodeURIComponent(value);
}

const slugSegment = (slug: string): string =>
  segment("slug", slug, SLUG_PATTERN);

export const apiPaths = {
  /** D1: link info. */
  publicLink: (slug: string): string => `/public/v/${slugSegment(slug)}`,
  /** D2: company autofill, with the canonical CNPJ as the only query parameter. */
  lookup: (slug: string, cnpj: string): string => {
    const query = new URLSearchParams({
      cnpj: segment("CNPJ", cnpj, CNPJ_PATTERN),
    });
    return `/public/v/${slugSegment(slug)}/lookup?${query.toString()}`;
  },
  /** D3: start a verification. */
  verify: (slug: string): string => `/public/v/${slugSegment(slug)}/verify`,
  /** D4: a case's state and seller-facing result. */
  publicCase: (slug: string, token: string): string =>
    `/public/v/${slugSegment(slug)}/cases/${segment("token", token, TOKEN_PATTERN)}`,
  /** D5: the seller's contact e-mail for a case. */
  caseContact: (slug: string, token: string): string =>
    `${apiPaths.publicCase(slug, token)}/contact`,
};
