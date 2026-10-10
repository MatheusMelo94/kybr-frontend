"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { filaCopy } from "@/features/panel-fila/copy";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useRefreshUntilReplaced } from "@/lib/navigation/refresh-until";

/**
 * The case didn't load but the list did (spec AC 28): fila.detail.error and
 * a retry that refreshes until the detail replaces this.
 */
export function CaseDetailError(): JSX.Element {
  const retry = useRefreshUntilReplaced();
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-body text-ink">{filaCopy["fila.detail.error"]}</p>
      <Button
        variant="secondary"
        size="panel"
        onClick={retry}
        className="self-start"
      >
        {globalCopy["error.load.cta"]}
      </Button>
    </div>
  );
}
