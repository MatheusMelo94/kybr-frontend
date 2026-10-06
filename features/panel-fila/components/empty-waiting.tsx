import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";

/** No case waiting for a seller (AC 46). */
export function EmptyWaiting(): JSX.Element {
  return (
    <p data-fila-empty className="text-body text-ink-muted">
      {filaCopy["fila.waiting.empty"]}
    </p>
  );
}
