import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { formCopy } from "@/features/seller-link/copy/form";

type Props = {
  onRetry: () => void;
};

/** The link info failed to load (spec AC 4). The retry asks for it again. */
export function LoadError({ onRetry }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title">{formCopy["loaderror.h1"]}</h1>
      <p className="text-body text-ink-muted">{formCopy["loaderror.body"]}</p>
      <Button onClick={onRetry} className="mt-3 w-full">
        {formCopy["loaderror.cta"]}
      </Button>
    </div>
  );
}
