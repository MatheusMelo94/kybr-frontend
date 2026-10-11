import type { Metadata } from "next";
import { Suspense, type JSX } from "react";

import { defaultAuditRange } from "@/features/panel-sellers/audit-range";
import { ExportButtons } from "@/features/panel-sellers/components/export-buttons";
import { SearchForm } from "@/features/panel-sellers/components/search-form";
import { SellersEmpty } from "@/features/panel-sellers/components/sellers-empty";
import { SellersPager } from "@/features/panel-sellers/components/sellers-pager";
import { SellersSkeleton } from "@/features/panel-sellers/components/sellers-skeleton";
import { SellersTable } from "@/features/panel-sellers/components/sellers-table";
import { StatusFilter } from "@/features/panel-sellers/components/status-filter";
import { sellersCopy } from "@/features/panel-sellers/copy";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { planGate } from "@/features/panel-shell/plan-variant";
import {
  parseSellersSearch,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { listSellers } from "@/lib/api/panel/sellers";
import { requireSession } from "@/lib/api/panel/session";

// O-F6: a static title, never the search.
const EXHAUSTED_ID = "vendedores-sem-saldo";

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
        {/* P8-001: a soft navigation keeps the leaf mounted and defaultValue
            only applies on mount, so a new q remounts the box. */}
        <SearchForm key={search.q ?? ""} search={search} />
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
  // T141: Reverificar spends a credit; with none left every row's button is
  // disabled and described by one plan.exhausted note (the server still
  // answers SEM_SALDO, plan-m8 § 6).
  const exhausted = planGate(me.workspace.plano) !== undefined;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {exhausted && (
        <p id={EXHAUSTED_ID} className="text-secondary text-ink-muted">
          {shellCopy["plan.exhausted"]}
        </p>
      )}
      <SellersTable
        rows={page.itens}
        exhausted={exhausted ? { describedBy: EXHAUSTED_ID } : undefined}
      />
      <SellersPager search={search} paginas={page.paginas} />
      <ExportButtons
        search={{ status: search.status, q: search.q }}
        total={page.total}
        auditRange={defaultAuditRange(new Date())}
      />
    </div>
  );
}
