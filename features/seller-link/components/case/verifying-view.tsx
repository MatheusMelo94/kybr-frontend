import type { JSX } from "react";

import { caseCopy } from "@/features/seller-link/copy/case";

/**
 * *Verificando* (spec AC 15): the honest wait of up to 10 s. The status text
 * and the step indicator carry the state (the indeterminate bar, T33, is
 * decoration on top and is dropped under reduced motion).
 */
export function VerifyingView(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title">{caseCopy["verifying.h1"]}</h1>
      <p className="text-body text-ink-muted">{caseCopy["verifying.status"]}</p>
    </div>
  );
}
