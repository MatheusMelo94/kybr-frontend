import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";

/** Part of the case didn't load (DC § Screen States Matrix: partial). */
export function PartialNotice(): JSX.Element {
  return (
    <p className="rounded-lg border border-line p-3 text-body text-ink">
      {filaCopy["fila.detail.partial"]}
    </p>
  );
}
