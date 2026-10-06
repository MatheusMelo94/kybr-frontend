// The Fila's bounds (plan-m6 § 3.2, Security F6).

/** A decide / request-documents call with no result by then is an unknown outcome: re-read, never report done. */
export const DECIDE_TIMEOUT_MS = 15_000;

/** Two panes from Tailwind's lg (64rem): matchMedia for the client's choices (D4). */
export const LG_MEDIA = "(min-width: 64rem)";
