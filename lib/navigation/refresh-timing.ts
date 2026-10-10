// The refresh workaround's cadence (refresh-until.ts), in a module with no
// client code so the E2E specs size their waits from it (P6-005).

/** A refresh now, then again every EVERY_MS while the view isn't replaced. */
export const EVERY_MS = 2_000;

/** At most this many refreshes, then a full load. */
export const MAX_REFRESHES = 5;

/**
 * The longest a state that rides the workaround may take to show: every
 * refresh dropped, then the full load (5 s of slack for it).
 */
export const REFRESH_SETTLE_MS = EVERY_MS * MAX_REFRESHES + 5_000;
