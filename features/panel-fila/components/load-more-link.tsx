import type { JSX } from "react";

import { FilaSoftLink } from "@/features/panel-fila/components/fila-soft-link";
import { filaCopy } from "@/features/panel-fila/copy";
import {
  FILA_PAGE,
  filaHref,
  type FilaAba,
} from "@/features/panel-fila/search-params";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { fill } from "@/features/panel-shell/format";

type Props = {
  /** /fila or /fila/{id}: the open case stays open. */
  base: string;
  aba: FilaAba;
  ate: number;
  /** Cases past the ones shown. */
  remaining: number;
};

/** "Carregar mais {n}": the same list, 25 longer, with the scroll kept (plan D2). */
export function LoadMoreLink({
  base,
  aba,
  ate,
  remaining,
}: Props): JSX.Element {
  return (
    <FilaSoftLink
      href={filaHref(base, { aba, ate: ate + FILA_PAGE })}
      className={`${PANEL_LINK} self-start`}
    >
      {fill(filaCopy["fila.more"], { n: Math.min(remaining, FILA_PAGE) })}
    </FilaSoftLink>
  );
}
