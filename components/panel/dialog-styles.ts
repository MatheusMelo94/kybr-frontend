// The dialog's classes, in a plain module so primitives.spec can render one
// under the panel's real stylesheet and read its computed motion and size.

/**
 * A native <dialog> shown with showModal(). Below lg: a full-height bottom
 * sheet that slides up (translateY 100% → 0). At lg and up: centred, at most
 * 32rem (≤ 520 px, spec § Responsive), fading in. Both at --duration-base,
 * with @starting-style and allow-discrete so display/overlay hold for the
 * exit. Reduced motion: opacity only, everywhere (spec § Motion Intent).
 * The translate lives only under max-lg + motion-safe and the opacity fade
 * only under lg or motion-reduce, so the two never fight.
 */
export const DIALOG =
  "border border-line bg-surface p-0 text-ink backdrop:bg-ink/40 dark:backdrop:bg-surface/70 " +
  "max-lg:m-0 max-lg:h-dvh max-lg:max-h-none max-lg:w-full max-lg:max-w-none max-lg:border-0 " +
  "lg:w-full lg:max-w-lg lg:rounded-lg " +
  "transition-[opacity,translate,display,overlay] transition-discrete duration-(--duration-base) ease-out-quart " +
  "motion-reduce:transition-[opacity,display,overlay] " +
  "max-lg:motion-safe:translate-y-full max-lg:motion-safe:open:translate-y-0 max-lg:motion-safe:starting:open:translate-y-full " +
  "lg:opacity-0 lg:open:opacity-100 lg:starting:open:opacity-0 " +
  "motion-reduce:opacity-0 motion-reduce:open:opacity-100 motion-reduce:starting:open:opacity-0";

/**
 * The sheet's content clears the home indicator: 16 px plus the bottom
 * safe-area inset (an arbitrary value: Tailwind has no env() utility).
 */
export const DIALOG_BODY =
  "flex max-h-full flex-col gap-4 p-4 max-lg:h-full max-lg:pb-[calc(--spacing(4)+env(safe-area-inset-bottom))] lg:p-6";

/** ≥ 24 px, ≥ 44 px on coarse pointers. */
export const DIALOG_CLOSE =
  "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-ink disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11 pointer-coarse:min-w-11";
