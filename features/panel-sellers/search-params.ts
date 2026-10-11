import {
  SELLER_QUERY_MAX,
  isSellerStatus,
  type SellerStatus,
} from "@/lib/panel-api-values";

// Vendedores' URL state (plan-m8 D5): ?status=&q=&pagina=. An unknown,
// repeated or oversized value is the default, never an API parameter.

export type SellersSearch = {
  pagina: number;
  status?: SellerStatus;
  q?: string;
};

/** Far beyond any real base (50 per page); a bigger number is a typo. */
const PAGINA_MAX = 100_000;

/** A masked (or partly masked) CNPJ: digits/letters with . / - between. */
const MASKED_CNPJ = /^[0-9A-Za-z]{2}(?:[./-]?[0-9A-Za-z])*$/;

/**
 * D5: a CNPJ-shaped search is normalized (digits/letters, uppercase), so a
 * masked one finds the seller; anything else is sent as typed.
 */
function normalizeQuery(q: string): string {
  return MASKED_CNPJ.test(q) && /\d/.test(q)
    ? q.replace(/[./-]/g, "").toUpperCase()
    : q;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseSellersSearch(
  params: Record<string, string | string[] | undefined>,
): SellersSearch {
  const search: SellersSearch = { pagina: 1 };
  const q = single(params.q)?.trim();
  if (q !== undefined && q !== "" && q.length <= SELLER_QUERY_MAX)
    search.q = normalizeQuery(q);
  const status = single(params.status);
  if (status !== undefined && isSellerStatus(status)) search.status = status;
  const pagina = single(params.pagina);
  if (pagina !== undefined && /^[1-9]\d*$/.test(pagina)) {
    const value = Number(pagina);
    if (value <= PAGINA_MAX) search.pagina = value;
  }
  return search;
}

/** The external URL for a search, defaults left out: status, q, pagina. */
export function sellersHref(search: SellersSearch): string {
  const params = new URLSearchParams();
  if (search.status !== undefined) params.set("status", search.status);
  if (search.q !== undefined) params.set("q", search.q);
  if (search.pagina > 1) params.set("pagina", String(search.pagina));
  const query = params.toString();
  return query === "" ? "/vendedores" : `/vendedores?${query}`;
}
