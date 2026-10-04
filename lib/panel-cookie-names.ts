// The panel's cookie names (ADR-0009 rule 3). Pure: middleware checks the
// session cookie's presence by name, and lib/api/panel/cookies.ts reads and
// writes it.

export type PanelCookieNames = {
  session: string;
  signup: string;
  secure: boolean;
};

/**
 * __Host- names with Secure everywhere, except on local http (a loopback
 * host behind the local-only API_ALLOW_LOOPBACK_HTTP flag), where WebKit
 * refuses Secure cookies: there the plain names, without Secure.
 */
export function panelCookieNames(localHttp: boolean): PanelCookieNames {
  return localHttp
    ? { session: "kybr_session", signup: "kybr_signup", secure: false }
    : {
        session: "__Host-kybr_session",
        signup: "__Host-kybr_signup",
        secure: true,
      };
}
