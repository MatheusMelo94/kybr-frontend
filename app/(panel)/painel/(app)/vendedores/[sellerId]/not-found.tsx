import type { Metadata } from "next";
import type { JSX } from "react";

import { sellersCopy } from "@/features/panel-sellers/copy";

export const metadata: Metadata = { title: sellersCopy["sellers.notfound.h"] };

/** A malformed, unknown or foreign seller: the same words and markup (AC 73). */
export default function SellerNotFound(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title text-ink">
        {sellersCopy["sellers.notfound.h"]}
      </h1>
      <p className="text-body text-ink-muted">
        {sellersCopy["sellers.notfound.body"]}
      </p>
    </div>
  );
}
