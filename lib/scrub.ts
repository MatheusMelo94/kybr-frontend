// Scrubbing for anything that leaves the server for monitoring (T34a;
// SEC § Logging & Monitoring). Pure: shared by lib/monitoring.ts and the CSP
// report parser.

/**
 * The capability token in every URL shape that carries one (M3-04): the page
 * (/v/{slug}/c/{token}) and the API (/public/v/{slug}/cases/{token}/…, D4–D6),
 * in any letter case and with an empty slug.
 */
const CASE_TOKEN = /(\/v\/[^/?#\s]*\/(?:c|cases)\/)[^/?#\s"']+/gi;
/** 14-character CNPJs (numeric or alphanumeric, bare or punctuated). */
const CNPJ =
  /\b[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}\b/g;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
/** 11-digit CPFs, bare or punctuated. */
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/** A URL (absolute or a path) without its case token, query or fragment. */
export function scrubUrl(url: string): string {
  return url.replace(/[?#].*$/, "").replace(CASE_TOKEN, "$1[token]");
}

/** Free text with case tokens, CNPJs, CPFs and e-mail addresses masked. */
export function scrubText(value: string): string {
  return value
    .replace(CASE_TOKEN, "$1[token]")
    .replace(EMAIL, "[email]")
    .replace(CNPJ, "[cnpj]")
    .replace(CPF, "[cpf]");
}
