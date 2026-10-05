import type { JSX } from "react";

import { shellCopy } from "@/features/panel-shell/copy/shell";

/**
 * The M4 Fila: its title and lead only (plan § 3.2, P-U2: unreleased).
 * REPLACED IN M6 by the real Fila (list + case detail).
 */
export function FilaStub(): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-title font-title text-ink">{shellCopy["fila.h1"]}</h1>
      <p className="text-body font-lead text-ink-muted">
        {shellCopy["fila.lead"]}
      </p>
    </div>
  );
}
