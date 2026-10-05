import type { JSX } from "react";

import { PagerLink } from "@/features/panel-lote/components/pager-link";
import { loteCopy } from "@/features/panel-lote/copy";
import { isPanelCursor, type BatchRowStatus } from "@/lib/panel-api-values";

type Props = {
  /** The batch's external path, /lote/{id}. */
  base: string;
  status: BatchRowStatus | undefined;
  cursor: string | undefined;
  /** The page's proximo_cursor (null on the last page). */
  next: string | null;
};

const LINK =
  "inline-flex min-h-10 items-center text-body font-strong text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

function href(base: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, value);
  const search = params.toString();
  return search === "" ? base : `${base}?${search}`;
}

/**
 * Forward-only paging (contract C2, plan D3): "Próximos 25" with the next
 * cursor, "Voltar ao início" once a cursor is set. Built with URLSearchParams
 * from a checked cursor (Security C11); the full list is in the CSV. Each
 * is a PagerLink (no prefetch: the rows are per request; the soft navigation
 * has a fallback, see soft-navigate.ts).
 */
export function TablePager({
  base,
  status,
  cursor,
  next,
}: Props): JSX.Element | null {
  const forward = next !== null && isPanelCursor(next);
  if (!forward && cursor === undefined) return null;
  return (
    <nav
      aria-label={loteCopy["lote.result.h"]}
      className="flex flex-wrap gap-4"
    >
      {cursor !== undefined && (
        <PagerLink href={href(base, { status })} className={LINK}>
          {loteCopy["lote.table.first"]}
        </PagerLink>
      )}
      {forward && (
        <PagerLink href={href(base, { status, cursor: next })} className={LINK}>
          {loteCopy["lote.table.next"]}
        </PagerLink>
      )}
    </nav>
  );
}
