"use client";

import { useId, type FormEvent, type JSX } from "react";

import { sellersCopy } from "@/features/panel-sellers/copy";
import {
  sellersHref,
  type SellersSearch,
} from "@/features/panel-sellers/search-params";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";
import { SELLER_QUERY_MAX } from "@/lib/panel-api-values";

const INPUT =
  "min-h-10 w-full min-w-0 rounded-md border border-field-line bg-field px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

/**
 * The search (plan-m8 D5, G8): a search landmark, submitted with Enter, that
 * soft-navigates to ?q= (keeping the status, back to page 1). No button: the
 * spec has none. The value never goes to the title or a log (O-F6).
 */
export function SearchForm({ search }: { search: SellersSearch }): JSX.Element {
  const navigate = useSoftNavigate();
  const id = useId();

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("q") ?? "",
    ).trim();
    navigate(
      sellersHref({
        pagina: 1,
        ...(search.status && { status: search.status }),
        ...(value !== "" && { q: value }),
      }),
    );
  }

  return (
    <form
      role="search"
      action="/vendedores"
      onSubmit={submit}
      className="flex min-w-0 flex-1 flex-col gap-1"
    >
      <label htmlFor={id} className="text-secondary font-strong text-ink">
        {sellersCopy["sellers.search.label"]}
      </label>
      <input
        id={id}
        name="q"
        type="search"
        enterKeyHint="search"
        maxLength={SELLER_QUERY_MAX}
        defaultValue={search.q ?? ""}
        autoComplete="off"
        className={INPUT}
      />
      {search.status !== undefined && (
        <input type="hidden" name="status" value={search.status} />
      )}
    </form>
  );
}
