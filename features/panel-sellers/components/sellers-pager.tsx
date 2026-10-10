import type { JSX } from "react";

import { SoftLink } from "@/components/panel/soft-link";
import {
  sellersHref,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { cn } from "@/lib/utils";

const LINK =
  "inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-body font-strong text-ink tabular-nums underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11 pointer-coarse:min-w-11";

/**
 * Numbered pages of 50 (plan-m8 D5, AC 55), each a SoftLink (no prefetch)
 * that keeps q and status. A list, not a nav landmark: the spec names no
 * label for one (flagged to UX).
 */
export function SellersPager({
  search,
  paginas,
}: {
  search: SellersSearch;
  paginas: number;
}): JSX.Element | null {
  if (paginas <= 1) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {Array.from({ length: paginas }, (_, i) => i + 1).map((pagina) => {
        const current = pagina === search.pagina;
        return (
          <li key={pagina}>
            <SoftLink
              href={sellersHref({ ...search, pagina })}
              className={cn(LINK, current && "bg-surface-raised no-underline")}
              {...(current && { "aria-current": "page" as const })}
            >
              {String(pagina)}
            </SoftLink>
          </li>
        );
      })}
    </ul>
  );
}
