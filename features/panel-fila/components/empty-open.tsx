import Link from "next/link";
import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";

/**
 * No open cases (AC 46): why it's empty, and the one action. In the detail
 * pane (`detailHeading`) the heading takes the focus after the last case is
 * decided (T105).
 */
export function EmptyOpen({
  detailHeading = false,
}: {
  detailHeading?: boolean;
}): JSX.Element {
  return (
    <div data-fila-empty className="flex flex-col gap-2">
      <h2
        {...(detailHeading && { "data-detail-heading": "", tabIndex: -1 })}
        className="text-h2 font-title text-ink"
      >
        {filaCopy["fila.empty.h"]}
      </h2>
      <p className="text-body text-ink-muted">{filaCopy["fila.empty.body"]}</p>
      <Link href="/lote" className={`${PANEL_LINK} self-start`}>
        {filaCopy["fila.empty.cta"]}
      </Link>
    </div>
  );
}
