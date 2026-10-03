import type { JSX, ReactNode } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { resultsCopy } from "@/features/seller-link/copy/results";

type PillProps = {
  children: ReactNode;
};

/**
 * A success pill: a dot plus text, in success-ink on the success tint (spec
 * § Design Handoff 6: 4.70:1 light, 4.93:1 dark). Color is never the only
 * signal (DC § Color).
 */
export function SuccessPill({ children }: PillProps): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-success/12 px-3 py-1 text-secondary font-strong text-success-ink">
      <StatusDot tone="success" />
      {children}
    </span>
  );
}

/** The *tudo certo* seal: "Vendedor verificado" (spec AC 19). */
export function Seal(): JSX.Element {
  return (
    <p className="flex">
      <SuccessPill>{resultsCopy["approved.seal"]}</SuccessPill>
    </p>
  );
}
