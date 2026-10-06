// The Fila's bounds (plan-m6 § 3.2, Security F6).

/** A decide / request-documents call with no result by then is an unknown outcome: re-read, never report done. */
export const DECIDE_TIMEOUT_MS = 15_000;
