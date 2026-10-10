import Link from "next/link";
import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { filaHref, type FilaSearch } from "@/features/panel-fila/search-params";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { cn } from "@/lib/utils";

type Props = {
  search: FilaSearch;
  /** A decided case shows it at every width (its only way on, AC 41). */
  always?: boolean;
};

/** "Voltar para a fila" at the top of a case below lg, keeping the tab. */
export function BackLink({ search, always = false }: Props): JSX.Element {
  return (
    <p className={cn(!always && "lg:hidden")}>
      <Link href={filaHref("/fila", search)} className={PANEL_LINK}>
        {filaCopy["fila.back"]}
      </Link>
    </p>
  );
}
