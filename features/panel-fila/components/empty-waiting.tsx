import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";

/** No case waiting for a seller (AC 46); focusable in the detail pane (T105). */
export function EmptyWaiting({
  detailHeading = false,
}: {
  detailHeading?: boolean;
}): JSX.Element {
  return (
    <p
      data-fila-empty
      {...(detailHeading && { "data-detail-heading": "", tabIndex: -1 })}
      className="text-body text-ink-muted"
    >
      {filaCopy["fila.waiting.empty"]}
    </p>
  );
}
