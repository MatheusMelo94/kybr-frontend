import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { formatDataHora } from "@/features/panel-fila/format";
import { fill } from "@/features/panel-shell/format";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = { decisao: NonNullable<CaseView["decisao"]> };

/** A decided case (spec AC 41): the decision (G2 words), its reason and note. */
export function DecidedBanner({ decisao }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-raised p-4">
      <p className="text-body font-strong text-ink">
        {fill(filaCopy["fila.decided.banner"], {
          decisao: filaCopy[`fila.decision.${decisao.tipo}`],
          data_hora: formatDataHora(decisao.em),
        })}
      </p>
      {decisao.motivo_codigo !== undefined && (
        <p className="text-body text-ink">
          {fill(filaCopy["fila.decided.reason"], {
            motivo: filaCopy[`block.reason.${decisao.motivo_codigo}`],
          })}
        </p>
      )}
      {decisao.nota_vendedor !== undefined && (
        <p className="text-body break-words text-ink">
          {fill(filaCopy["fila.decided.note"], {
            nota: decisao.nota_vendedor,
          })}
        </p>
      )}
    </div>
  );
}
