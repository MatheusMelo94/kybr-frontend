"use client";

import type { JSX } from "react";

import { Select } from "@/components/panel/select";
import { sellersCopy } from "@/features/panel-sellers/copy";
import {
  sellersHref,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { SELLER_STATUS_WORDS } from "@/features/panel-sellers/status-words";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";
import { SELLER_STATUSES, isSellerStatus } from "@/lib/panel-api-values";

/** The status filter (AC 55): ?status=, keeping q, back to page 1. */
export function StatusFilter({
  search,
}: {
  search: SellersSearch;
}): JSX.Element {
  const navigate = useSoftNavigate();
  return (
    <Select
      label={sellersCopy["sellers.filter.label"]}
      value={search.status ?? ""}
      onChange={(value) =>
        navigate(
          sellersHref({
            pagina: 1,
            ...(isSellerStatus(value) && { status: value }),
            ...(search.q !== undefined && { q: search.q }),
          }),
        )
      }
      className="sm:max-w-xs"
    >
      <option value="">{sellersCopy["sellers.filter.all"]}</option>
      {SELLER_STATUSES.map((status) => (
        <option key={status} value={status}>
          {SELLER_STATUS_WORDS[status].word}
        </option>
      ))}
    </Select>
  );
}
