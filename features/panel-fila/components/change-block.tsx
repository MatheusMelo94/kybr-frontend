import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { fill, formatDate } from "@/features/panel-shell/format";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = { mudanca: NonNullable<CaseView["mudanca"]> };

/** O que mudou (spec AC 31): the change the monitoring scan found. */
export function ChangeBlock({ mudanca }: Props): JSX.Element {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line p-4">
      <h3 className="text-body font-strong text-ink">
        {filaCopy["fila.change.h"]}
      </h3>
      <p className="text-body break-words text-ink">
        {fill(filaCopy["fila.change.row"], {
          campo: mudanca.campo,
          de: mudanca.de,
          para: mudanca.para,
        })}
      </p>
      <p className="text-secondary text-ink-muted">
        {fill(filaCopy["fila.change.when"], {
          data: formatDate(mudanca.detectado_em),
        })}
      </p>
    </section>
  );
}
