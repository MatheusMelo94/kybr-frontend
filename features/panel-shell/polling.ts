// Polling cadences for the panel (ADR-0011 rule 3: one module). A poll runs
// only while the tab is visible and online, and fires once on becoming so.

/** Shell counts and plan block (spec S5). */
export const SHELL_STATUS_INTERVAL_MS = 60_000;

/** A running batch's progress on /lote/[batchId] (spec S7, D-B2: every 2 s). */
export const BATCH_PROGRESS_INTERVAL_MS = 2_000;

/** The Fila's new-case check (spec S6, C-M6-1 `desde`): a notice, never a reorder. */
export const FILA_NEW_CASES_INTERVAL_MS = 60_000;

/** Every poll's API timeout: a slow poll must not hold the serial action queue (plan § 2.3, R6). */
export const POLL_TIMEOUT_MS = 4_000;

/** True while a poll is worth doing. */
export function canPoll(): boolean {
  return document.visibilityState === "visible" && navigator.onLine;
}
