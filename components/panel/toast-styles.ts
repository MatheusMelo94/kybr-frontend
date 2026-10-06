// The toast's classes, in a plain module so primitives.spec can render one
// under the panel's real stylesheet and read its computed transition.

/** Bottom right at sm and up; full width with the 16 px gutter below. */
export const TOAST_REGION =
  "pointer-events-none fixed inset-x-4 bottom-4 z-20 flex flex-col items-stretch gap-2 sm:left-auto sm:w-96";

/**
 * Spec § Motion Intent: in with @starting-style, opacity + an 8 px rise at
 * --duration-base; out at --duration-fast. Reduced motion: opacity only. A
 * --color-line border and no shadow (spec § Design Handoff 6).
 */
export const TOAST_ITEM =
  "pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface py-2 pr-2 pl-4 text-secondary text-ink " +
  "transition-[opacity,translate] duration-(--duration-base) ease-out-quart starting:translate-y-2 starting:opacity-0 " +
  "data-leaving:translate-y-2 data-leaving:opacity-0 data-leaving:duration-(--duration-fast) " +
  "motion-reduce:transition-opacity motion-reduce:starting:translate-y-0 motion-reduce:data-leaving:translate-y-0";

/** ≥ 24 px, ≥ 44 px on coarse pointers. */
export const TOAST_CLOSE =
  "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11 pointer-coarse:min-w-11";
