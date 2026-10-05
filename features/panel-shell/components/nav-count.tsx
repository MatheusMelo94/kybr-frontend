import type { JSX } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import { cn } from "@/lib/utils";

/** The exclamation-in-circle beside the danger dot: the late state's non-color cue (Q9, WCAG 1.4.1). */
function AlertGlyph(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3 shrink-0"
      fill="none"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.5v4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

type Props = {
  abertos: number;
  vencidos: number;
};

/**
 * The Fila's count (AC 11): the visible number is aria-hidden, and the
 * link's accessible name carries nav.fila.count_sr.* (or _late). With an
 * overdue case: the same neutral pill with the danger dot and the glyph, and
 * at 1280 a second line in ink-muted (brand v1, DDR-0003: the signal is a
 * dot, never a red fill or red text). Zero hides it.
 */
export function NavCount({ abertos, vencidos }: Props): JSX.Element | null {
  if (abertos <= 0) return null;
  const late = vencidos > 0;
  const n = formatNumber(abertos);
  const m = formatNumber(vencidos);
  const spoken = late
    ? fill(plural(shellCopy, "nav.fila.count_sr_late", abertos), { n, m })
    : fill(plural(shellCopy, "nav.fila.count_sr", abertos), { n });

  return (
    <>
      <VisuallyHidden>{spoken}</VisuallyHidden>
      <span
        data-testid="nav-count"
        aria-hidden="true"
        className={cn(
          "ml-auto inline-flex min-w-6 items-center justify-center gap-1 rounded-full bg-field px-2 text-secondary font-strong text-ink tabular-nums",
        )}
      >
        {late && <StatusDot tone="danger" />}
        {late && <AlertGlyph />}
        {n}
      </span>
      {late && (
        <span
          aria-hidden="true"
          className="hidden w-full text-secondary text-ink-muted lg:block"
        >
          {fill(plural(shellCopy, "nav.fila.late", vencidos), { m })}
        </span>
      )}
    </>
  );
}
