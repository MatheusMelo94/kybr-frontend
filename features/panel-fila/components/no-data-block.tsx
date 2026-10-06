import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";

/** DADOS_NAO_ENCONTRADOS (spec AC 32): fila.nodata.body in place of the checks. */
export function NoDataBlock(): JSX.Element {
  return (
    <p className="text-body text-ink-muted">{filaCopy["fila.nodata.body"]}</p>
  );
}
