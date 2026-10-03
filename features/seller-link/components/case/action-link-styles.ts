// Links that look like the Button primitive's pills (a link navigates, so it
// stays an <a>). Kept with the case screen, so components/ui and the form's
// chunk don't grow (ADR-0003 budget watch).

const SHARED =
  "inline-flex w-full items-center justify-center rounded-full px-6 text-body font-strong no-underline " +
  "transition-colors duration-(--duration-fast) ease-out-quart motion-reduce:transition-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** The screen's one primary action: accent pill, 48 px. */
export const PRIMARY_ACTION_LINK = `${SHARED} h-12 bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80`;

/** A neutral secondary action: outlined pill, at least 44 px. */
export const SECONDARY_ACTION_LINK = `${SHARED} min-h-11 border border-field-line bg-transparent text-ink hover:bg-surface-raised active:bg-field`;
