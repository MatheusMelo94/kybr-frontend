import Link from "next/link";
import type { JSX } from "react";

import { CopyLinkButton } from "@/components/panel/copy-link-button";
import { homeCopy } from "@/features/panel-home/copy";
import { sellersCopy } from "@/features/panel-sellers/copy";
import {
  sellersHref,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { settingsCopy } from "@/features/panel-settings/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { fill } from "@/features/panel-shell/format";

/**
 * Vendedores' empty states (AC 55). Nobody yet: sellers.empty.* + "Copiar
 * link de cadastro" (primary) + "Verificar em lote" (the Início CTAs' keys).
 * Nothing for the search: sellers.empty.search + "Limpar busca", which
 * drops q and keeps the filter. Nothing for a filter alone:
 * sellers.empty.filter + "Mostrar todos" (spec, 2026-10-10).
 */
export function SellersEmpty({
  search,
  linkUrl,
}: {
  search: SellersSearch;
  linkUrl: string;
}): JSX.Element {
  if (search.q === undefined && search.status === undefined)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-h2 font-title text-ink">
            {sellersCopy["sellers.empty.h"]}
          </h2>
          <p className="text-body text-ink-muted">
            {sellersCopy["sellers.empty.body"]}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <CopyLinkButton
            value={linkUrl}
            label={homeCopy["home.cta.copy"]}
            inputLabel={settingsCopy["settings.link.h"]}
            inputVisible="on-error"
          />
          <Link href="/lote" className={PANEL_LINK}>
            {homeCopy["home.cta.lote"]}
          </Link>
        </div>
      </div>
    );

  if (search.q === undefined)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-ink">
          {sellersCopy["sellers.empty.filter"]}
        </p>
        <Link
          href={sellersHref({ pagina: 1 })}
          className={`${PANEL_LINK} self-start`}
        >
          {sellersCopy["sellers.empty.filter.cta"]}
        </Link>
      </div>
    );
  const cleared: SellersSearch = {
    pagina: 1,
    ...(search.status && { status: search.status }),
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body break-words text-ink">
        {fill(sellersCopy["sellers.empty.search"], { busca: search.q })}
      </p>
      <Link href={sellersHref(cleared)} className={`${PANEL_LINK} self-start`}>
        {sellersCopy["sellers.empty.search.cta"]}
      </Link>
    </div>
  );
}
