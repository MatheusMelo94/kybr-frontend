import Link from "next/link";
import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";

/** No open cases (AC 46): why it's empty, and the one action. */
export function EmptyOpen(): JSX.Element {
  return (
    <div data-fila-empty className="flex flex-col gap-2">
      <h2 className="text-h2 font-title text-ink">
        {filaCopy["fila.empty.h"]}
      </h2>
      <p className="text-body text-ink-muted">{filaCopy["fila.empty.body"]}</p>
      <Link href="/lote" className={`${PANEL_LINK} self-start`}>
        {filaCopy["fila.empty.cta"]}
      </Link>
    </div>
  );
}
