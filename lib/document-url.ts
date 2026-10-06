import { isLoopbackHostname } from "./safe-url";

type Allowlist = {
  /** PANEL_DOCUMENTS_ORIGIN, already validated as a bare origin by the env schema. */
  origin: string | undefined;
  /** Outside production, or with API_ALLOW_LOOPBACK_HTTP=true (Q1): http: on a loopback host. */
  allowLoopbackHttp: boolean;
};

/**
 * F2: true only when a signed document URL from the backend sits on exactly
 * the allowlisted documents origin. Origins are compared as whole strings
 * (never startsWith/includes), and userinfo is refused on its own because
 * URL.origin drops it.
 */
export function isAllowedDocumentUrl(
  value: string,
  { origin, allowLoopbackHttp }: Allowlist,
): boolean {
  if (origin === undefined) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const schemeAllowed =
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      allowLoopbackHttp &&
      isLoopbackHostname(url.hostname));
  return (
    schemeAllowed &&
    url.username === "" &&
    url.password === "" &&
    url.origin === origin
  );
}
