import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";

/** "O que isso resolve" (S7): the generic card before a result (T82 adds the real counts). */
export function WhyCard(): JSX.Element {
  return (
    <section
      aria-labelledby="lote-why-h"
      className="flex flex-col gap-3 rounded-lg border border-line p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="lote-why-h" className="text-h2 font-title text-ink">
          {loteCopy["lote.why.h"]}
        </h2>
        <p className="text-secondary text-ink-muted">
          {loteCopy["lote.why.sub"]}
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink">
        <li>{loteCopy["lote.why.generic.1"]}</li>
        <li>{loteCopy["lote.why.generic.2"]}</li>
        <li>{loteCopy["lote.why.generic.3"]}</li>
      </ul>
    </section>
  );
}
