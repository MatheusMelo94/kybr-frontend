declare const safeHttpsUrlBrand: unique symbol;

/**
 * An absolute https: URL that passed toSafeHttpsUrl(). Components that render a
 * URL from data (ExternalLink) accept only this type, so an unchecked string
 * (javascript:, data:, http:) can't reach an href.
 */
export type SafeHttpsUrl = string & { readonly [safeHttpsUrlBrand]: true };

/** Returns the normalized URL when it's absolute https: without credentials, otherwise undefined. */
export function toSafeHttpsUrl(value: string): SafeHttpsUrl | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return undefined;
  }
  return url.href as SafeHttpsUrl;
}
