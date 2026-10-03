import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { caseCopy } from "@/features/seller-link/copy/case";

type Props = {
  onRetry: () => void;
};

/** The case failed to load (spec AC 28). The retry asks for it again. */
export function CaseError({ onRetry }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title">{caseCopy["caseerror.h1"]}</h1>
      <p className="text-body text-ink-muted">{caseCopy["caseerror.body"]}</p>
      <Button onClick={onRetry} className="mt-3 w-full">
        {caseCopy["caseerror.cta"]}
      </Button>
    </div>
  );
}
