// The panel session's limits (ADR-0009; Security O-F3), shared by the
// session schema the login and the password change parse, and the one
// cookie writer (lib/api/panel/cookies.ts).

/** U-P6: a session lives 7 days at most (absolute). */
export const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60;

/** A session id: printable ASCII without spaces, 16..512 (a safe cookie value). */
export const SESSION_TOKEN = /^[\x21-\x7e]{16,512}$/;

/**
 * How far the API's clock may run ahead of ours: a fresh 7-day session
 * stamped by a slightly fast API still parses. The cookie's Max-Age stays
 * clamped to 7 days whatever this allows.
 */
export const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;
