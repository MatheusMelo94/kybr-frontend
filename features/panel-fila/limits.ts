// The Fila's bounds (plan-m6 § 3.2, Security F6).

/** A decide / request-documents call with no result by then is an unknown outcome: re-read, never report done. */
export const DECIDE_TIMEOUT_MS = 15_000;

/** Two panes from Tailwind's lg (64rem): matchMedia for the client's choices (D4). */
export const LG_MEDIA = "(min-width: 64rem)";

/** D-C3 / D-C4 nota_vendedor's cap (C-M6-4): the actions' schemas and the dialogs' fields. */
export const NOTA_VENDEDOR_MAX = 280;

/** C-M6-1: the oldest `desde` the new-case poll may send (the API refuses older). */
export const DESDE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
