import type { CaseTabEstado } from "@/lib/panel-api-values";

// The Fila's URL state (plan D2): ?aba= (missing → aberto) and ?ate= (the
// list's length: 25, 50, … 200). Parsed plainly on the server (F12): an
// unknown or repeated value is the default, never an API parameter.

export const FILA_ABAS = ["aberto", "aguardando"] as const;
export type FilaAba = (typeof FILA_ABAS)[number];
export type FilaSearch = { aba: FilaAba; ate: number };

/** One page of the list, and the most `?ate=` reads in one call (C-M6-2). */
export const FILA_PAGE = 25;
export const FILA_ATE_MAX = 200;

const ATE_PATTERN = /^[1-9][0-9]{1,2}$/;

type Params = Record<string, string | string[] | undefined>;

export function parseFilaSearch(params: Params): FilaSearch {
  const { aba, ate } = params;
  const n = typeof ate === "string" && ATE_PATTERN.test(ate) ? Number(ate) : 0;
  return {
    aba: aba === "aguardando" ? "aguardando" : "aberto",
    ate: n <= FILA_ATE_MAX && n % FILA_PAGE === 0 && n > 0 ? n : FILA_PAGE,
  };
}

export function estadoOf(aba: FilaAba): CaseTabEstado {
  return aba === "aguardando" ? "aguardando_doc" : "aberto";
}

/** A Fila URL on `base` (/fila or /fila/{id}), leaving the defaults out. */
export function filaHref(base: string, { aba, ate }: FilaSearch): string {
  const query = new URLSearchParams();
  if (aba !== "aberto") query.set("aba", aba);
  if (ate !== FILA_PAGE) query.set("ate", String(ate));
  const search = query.toString();
  return search === "" ? base : `${base}?${search}`;
}
