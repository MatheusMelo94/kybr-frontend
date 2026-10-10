"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { homeCopy } from "@/features/panel-home/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useRefreshUntil } from "@/lib/navigation/refresh-until";

// The card replacing this message unmounts it, which ends the loop.
const notYet = (): boolean => false;

/**
 * One Início card that didn't load (plan-m8 D2, PH3): home.card.error and a
 * retry that refreshes until the card replaces this message, then loads the
 * page fully once if Next dropped every refresh (useRefreshUntil, the same
 * Pre-Convention workaround as the Fila's). The other cards stay.
 */
export function CardError({
  describedBy,
}: {
  /** The card's heading (P8-006): up to four retries on one page. */
  describedBy?: string | undefined;
} = {}): JSX.Element {
  const retry = useRefreshUntil(notYet);
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-body text-ink-muted">{homeCopy["home.card.error"]}</p>
      <Button
        variant="secondary"
        size="panel"
        aria-describedby={describedBy}
        onClick={retry}
      >
        {globalCopy["error.load.cta"]}
      </Button>
    </div>
  );
}
