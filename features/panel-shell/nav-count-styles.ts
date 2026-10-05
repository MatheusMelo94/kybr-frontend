// The Fila count's classes, in a plain module so primitives.spec can check
// an inactive item's count (M4 ships one nav item, so none shows yet).
const BASE =
  "ml-auto inline-flex min-w-6 items-center justify-center gap-1 rounded-full px-2 text-secondary font-strong text-ink tabular-nums";

/**
 * A neutral pill on an inactive item; on the active one the item's own
 * highlight is the background, so the count is just the number (the
 * Aplicações board). The late cues (dot, glyph) never depend on it.
 */
export function navCountClassName(active: boolean): string {
  return active ? BASE : `${BASE} bg-field`;
}
