// The Notice's classes, in a plain module so primitives.spec can render a
// tone the shipped screens don't show yet and check its computed style.
export const NOTICE_BASE =
  "rounded-lg border bg-surface-raised px-4 py-3 text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** The text is ink in every tone; warning and danger add a 4 px coloured left bar (DDR-0003). */
export const NOTICE_TONES = {
  info: "border-line text-ink",
  warning: "border-line border-l-4 border-l-warning text-ink",
  danger: "border-line border-l-4 border-l-danger text-ink",
} as const;
