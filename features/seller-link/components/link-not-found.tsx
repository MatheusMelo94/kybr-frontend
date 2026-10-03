import type { JSX } from "react";

import { formCopy } from "@/features/seller-link/copy/form";

/** Link not found: an unknown, disabled or malformed slug (spec AC 3). No form. */
export function LinkNotFound(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title">{formCopy["notfound.h1"]}</h1>
      <p className="text-body text-ink-muted">{formCopy["notfound.body"]}</p>
    </div>
  );
}
