// The seller link's slug and token patterns (contract X3; the token is
// ≥ 128 bits), defined once. Plain regexes, no zod and no 'server-only': the
// API path builders (lib/api/path.ts), the public-link schema and the panel's
// parseLinkVendedor (F8) all import them.

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
