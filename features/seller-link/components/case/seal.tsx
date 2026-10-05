import type { JSX } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { Wordmark } from "@/components/ui/wordmark";
import { brandCopy } from "@/features/seller-link/copy/brand";
import { resultsCopy } from "@/features/seller-link/copy/results";

/**
 * The *tudo certo* seal, "Vendedor verificado por kybr." (spec AC 19; brand
 * v1, DDR-0002 + DDR-0003): a neutral pill, the green dot, the words in
 * ink, "por" in ink-muted, the inline wordmark in ink. Read as "Vendedor
 * verificado por Kybr". A Server Component, like its parents.
 */
export function Seal(): JSX.Element {
  return (
    <p className="flex">
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-secondary dark:bg-surface-raised">
        <StatusDot tone="success" />
        <span className="font-strong text-ink">
          {resultsCopy["approved.seal"]}
        </span>{" "}
        <span className="text-ink-muted">
          {resultsCopy["approved.seal.by"]}{" "}
          <Wordmark
            variant="inline"
            aria-label={brandCopy["brand.name"]}
            className="text-ink"
          />
        </span>
      </span>
    </p>
  );
}
