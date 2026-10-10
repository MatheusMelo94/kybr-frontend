"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { homeCopy } from "@/features/panel-home/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useRefreshUntilReplaced } from "@/lib/navigation/refresh-until";

/**
 * One Início card that didn't load (plan-m8 D2, PH3): home.card.error and a
 * retry that refreshes until the card replaces this message. The other
 * cards stay.
 */
export function CardError(): JSX.Element {
  const retry = useRefreshUntilReplaced();
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-body text-ink-muted">{homeCopy["home.card.error"]}</p>
      <Button variant="secondary" size="panel" onClick={retry}>
        {globalCopy["error.load.cta"]}
      </Button>
    </div>
  );
}
