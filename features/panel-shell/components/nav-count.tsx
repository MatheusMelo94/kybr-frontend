import type { JSX } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { navCountClassName } from "@/features/panel-shell/nav-count-styles";
import { plural } from "@/features/panel-shell/plural";

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
  /** The item is the current page: the count drops its pill (Aplicações board). */
  active?: boolean;
};

/**
 * The Fila's count (AC 11): the visible number is aria-hidden, and the
 * link's accessible name carries nav.fila.count_sr.* (or _late). With an
 * overdue case: the same neutral pill with the danger dot and the glyph, and
 * at 1280 a second line in ink-muted (brand v1, DDR-0003: the signal is a
 * dot, never a red fill or red text). On the active item the count has no
 * pill; the dot and the glyph stay (AC 71). Zero hides it.
 */
export function NavCount({
  abertos,
  vencidos,
  active = false,
}: Props): JSX.Element | null {
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
        className={navCountClassName(active)}
      >
        {late && <StatusDot tone="danger" />}
        {late && <AlertGlyph />}
        {n}
      </span>
      {late && (
        <span
          aria-hidden="true"
          className="hidden w-full text-secondary text-ink-muted tabular-nums lg:block"
        >
          {fill(plural(shellCopy, "nav.fila.late", vencidos), { m })}
        </span>
      )}
    </>
  );
}

/**
 * Monitoramento's count (S5): the undecided critical alerts, in the same
 * neutral pill, the number aria-hidden and the link's accessible name
 * carrying nav.monitor.count_sr.*. Zero hides it.
 */
/** A plain count: the number aria-hidden, the spoken text sr-only; zero hides it. */
function PlainCount({
  count,
  spoken,
  testId,
  active,
}: {
  count: number;
  spoken: (n: string) => string;
  testId: string;
  active: boolean;
}): JSX.Element | null {
  if (count <= 0) return null;
  const n = formatNumber(count);
  return (
    <>
      <VisuallyHidden>{spoken(n)}</VisuallyHidden>
      <span
        data-testid={testId}
        aria-hidden="true"
        className={navCountClassName(active)}
      >
        {n}
      </span>
    </>
  );
}

/** Monitoramento's count (S5): the undecided critical alerts. */
export function MonitorCount({
  alertas,
  active = false,
}: {
  alertas: number;
  active?: boolean;
}): JSX.Element | null {
  return (
    <PlainCount
      count={alertas}
      spoken={(n) =>
        fill(plural(shellCopy, "nav.monitor.count_sr", alertas), { n })
      }
      testId="nav-count-monitor"
      active={active}
    />
  );
}

/** Vendedores' count (spec AC 9, plan-m8 § 2): contagens.vendedores, as ws.sellers.*. */
export function SellersCount({
  vendedores,
  active = false,
}: {
  vendedores: number;
  active?: boolean;
}): JSX.Element | null {
  return (
    <PlainCount
      count={vendedores}
      spoken={(n) => fill(plural(shellCopy, "ws.sellers", vendedores), { n })}
      testId="nav-count-vendedores"
      active={active}
    />
  );
}
