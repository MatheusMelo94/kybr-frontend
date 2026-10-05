import type { JSX } from "react";

import { Wordmark } from "@/components/ui/wordmark";
import { brandCopy } from "@/features/seller-link/copy/brand";

/**
 * The Kybr attribution that ends every /v/* screen (link AC 40; brand v1,
 * DDR-0002): "Verificação por" in ink-muted, the inline wordmark in ink,
 * centered. Not a link, not focusable; read as "Verificação por Kybr". A
 * Server Component: the link ships no JS for it.
 */
export function KybrFooter(): JSX.Element {
  return (
    <footer className="mx-auto w-full max-w-link px-4 pt-4 pb-12 text-center text-secondary text-ink-muted">
      {brandCopy["brand.footer"]}{" "}
      <Wordmark
        variant="inline"
        aria-label={brandCopy["brand.name"]}
        className="text-ink"
      />
    </footer>
  );
}
