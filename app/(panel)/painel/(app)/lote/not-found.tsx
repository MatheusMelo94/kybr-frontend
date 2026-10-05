import type { Metadata } from "next";
import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";

export const metadata: Metadata = { title: loteCopy["lote.notfound.h"] };

// A batch id that fails A-X3/C10, is unknown, or belongs to another
// workspace: the same screen and the same 404 for all three (AC 73, P05).
export default function BatchNotFound(): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-title font-title text-ink">
        {loteCopy["lote.notfound.h"]}
      </h1>
      <p className="text-body text-ink-muted">
        {loteCopy["lote.notfound.body"]}
      </p>
    </div>
  );
}
