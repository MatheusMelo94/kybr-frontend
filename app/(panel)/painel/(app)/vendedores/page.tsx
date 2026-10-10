import type { Metadata } from "next";
import { Suspense, type JSX } from "react";

import { SearchForm } from "@/features/panel-sellers/components/search-form";
import { SellersEmpty } from "@/features/panel-sellers/components/sellers-empty";
import { SellersPager } from "@/features/panel-sellers/components/sellers-pager";
import { SellersSkeleton } from "@/features/panel-sellers/components/sellers-skeleton";
import { SellersTable } from "@/features/panel-sellers/components/sellers-table";
import { StatusFilter } from "@/features/panel-sellers/components/status-filter";
import { sellersCopy } from "@/features/panel-sellers/copy";
import {
  parseSellersSearch,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { listSellers } from "@/lib/api/panel/sellers";
import { requireSession } from "@/lib/api/panel/session";

// O-F6: a static title, never the search.
export const metadata: Metadata = { title: sellersCopy["sellers.h1"] };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * /vendedores (S10, AC 55): the search and the filter live in the URL
 * (plan-m8 D5). The table streams in its own Suspense (no loading.tsx, see
 * the layout), so a new search keeps the current rows while the server
 * renders. /me is the layout's read (React cache(), one request).
 */
export default async function SellersPage({
  searchParams,
}: Props): Promise<JSX.Element> {
  const search = parseSellersSearch(await searchParams);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-title text-ink">
          {sellersCopy["sellers.h1"]}
        </h1>
        <p className="text-lead font-lead text-ink-muted">
          {sellersCopy["sellers.lead"]}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-4">
        <SearchForm search={search} />
        <StatusFilter search={search} />
      </div>
      <Suspense fallback={<SellersSkeleton />}>
        <SellersBody search={search} />
      </Suspense>
    </div>
  );
}

async function SellersBody({
  search,
}: {
  search: SellersSearch;
}): Promise<JSX.Element> {
  const me = await requireSession();
  const page = await listSellers(search);
  if (page.total === 0)
    return <SellersEmpty search={search} linkUrl={me.workspace.link_url} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SellersTable rows={page.itens} />
      <SellersPager search={search} paginas={page.paginas} />
    </div>
  );
}
