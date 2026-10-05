import type { JSX, ReactNode } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";

type Props = {
  tone: StatusTone;
  children: ReactNode;
};

/**
 * A neutral pill: the signal is the dot, the word is ink (brand v1,
 * DDR-0003). Never a signal text colour or fill.
 */
export function StatusPill({ tone, children }: Props): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface-raised px-3 py-1 text-secondary font-strong text-ink">
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}
