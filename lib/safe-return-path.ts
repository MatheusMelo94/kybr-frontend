// The `volta` validator (ADR-0009 rule 11, threat model P10, AC 5). Pure: the
// login page, loginAction and the DAL's redirect use it. Anything that isn't
// a known panel screen on the panel's own origin is refused (null = home).

const MAX_LENGTH = 512;
// A fixed origin stands in for the panel host: what matters is that the
// resolved URL keeps it (PANEL_HOST itself never changes the answer).
const BASE = "https://panel.kybr.invalid";

/** Panel screens a login may return to: "/" and these prefixes (never an auth route or /v/). */
const SCREENS = [
  "/fila",
  "/lote",
  "/monitoramento",
  "/comecar",
  "/vendedores",
  "/regras",
  "/relatorio",
  "/integracoes",
  "/ver-como-vendedor",
  "/configuracoes",
];

function isScreen(pathname: string): boolean {
  return (
    pathname === "/" ||
    SCREENS.some(
      (screen) => pathname === screen || pathname.startsWith(`${screen}/`),
    )
  );
}

/** The validated path + query to return to, or null. Decodes once. */
export function safeReturnPath(
  volta: string | null | undefined,
): string | null {
  if (!volta || volta.length > MAX_LENGTH * 3) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(volta);
  } catch {
    return null;
  }
  if (
    decoded.length > MAX_LENGTH ||
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  )
    return null;

  let url: URL;
  try {
    url = new URL(decoded, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || !isScreen(url.pathname)) return null;
  return url.pathname + url.search;
}
