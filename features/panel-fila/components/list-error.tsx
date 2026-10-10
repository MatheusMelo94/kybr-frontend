"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { useRefreshUntilReplaced } from "@/lib/navigation/refresh-until";

/**
 * The list didn't load (AC 28): error.load.* in the list pane, so the rest of
 * the Fila (and an open case) stays. The retry refreshes until the list
 * replaces this banner.
 */
export function ListError(): JSX.Element {
  const retry = useRefreshUntilReplaced();
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-line p-4"
    >
      <p className="text-body font-strong text-ink">
        {globalCopy["error.load.title"]}
      </p>
      <p className="text-body text-ink-muted">
        {globalCopy["error.load.body"]}
      </p>
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
