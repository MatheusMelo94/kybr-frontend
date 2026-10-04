import type { JSX } from "react";

import { caseCopy } from "@/features/seller-link/copy/case";

/**
 * *Verificando* (spec AC 15): the honest wait of up to 10 s. The status text
 * and the step indicator carry the state. The indeterminate bar (T33) says
 * "still working": it exists only in this view, so it stops on any result or
 * on *em análise*, and it isn't rendered under reduced motion, where a static
 * bar would read as "done" (spec § Motion Intent, AC 32).
 */
export function VerifyingView(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 tabIndex={-1} className="text-title font-title">
        {caseCopy["verifying.h1"]}
      </h1>
      <p className="text-body text-ink-muted">{caseCopy["verifying.status"]}</p>
      <div
        aria-hidden="true"
        data-motion="indeterminate"
        className="relative h-1 overflow-hidden rounded-full bg-field motion-reduce:hidden"
      >
        <div className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-accent" />
      </div>
    </div>
  );
}
