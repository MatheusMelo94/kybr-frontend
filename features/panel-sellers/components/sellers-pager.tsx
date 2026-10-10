import type { JSX } from "react";

import { SoftLink } from "@/components/panel/soft-link";
import { sellersCopy } from "@/features/panel-sellers/copy";
import {
  sellersHref,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { cn } from "@/lib/utils";

const LINK =
  "inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-body font-strong text-ink tabular-nums underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11 pointer-coarse:min-w-11";

const WORD_LINK =
  "inline-flex min-h-10 items-center text-body font-strong text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

/**
 * Pages of 50 (plan-m8 D5, AC 55) in a nav named sellers.pager.label:
 * "Voltar ao início" past page 1, the numbered pages, "Próximos 50" before
 * the last (mirroring Lote's paging). Each is a SoftLink (no prefetch) that
 * keeps q and status.
 */
export function SellersPager({
  search,
  paginas,
}: {
  search: SellersSearch;
  paginas: number;
}): JSX.Element | null {
  if (paginas <= 1) return null;
  const at = (pagina: number) => sellersHref({ ...search, pagina });
  return (
    <nav
      aria-label={sellersCopy["sellers.pager.label"]}
      className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"
    >
      {search.pagina > 1 && (
        <SoftLink href={at(1)} className={WORD_LINK}>
          {sellersCopy["sellers.pager.first"]}
        </SoftLink>
      )}
      <ul className="flex flex-wrap gap-2">
        {Array.from({ length: paginas }, (_, i) => i + 1).map((pagina) => {
          const current = pagina === search.pagina;
          return (
            <li key={pagina}>
              <SoftLink
                href={at(pagina)}
                className={cn(
                  LINK,
                  current && "bg-surface-raised no-underline",
                )}
                {...(current && { "aria-current": "page" as const })}
              >
                {String(pagina)}
              </SoftLink>
            </li>
          );
        })}
      </ul>
      {search.pagina < paginas && (
        <SoftLink href={at(search.pagina + 1)} className={WORD_LINK}>
          {sellersCopy["sellers.pager.next"]}
        </SoftLink>
      )}
    </nav>
  );
}
