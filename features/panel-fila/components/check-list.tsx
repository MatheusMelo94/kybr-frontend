import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { StatusWord } from "@/features/panel-lote/components/status-word";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = {
  view: Pick<CaseView, "origem" | "responsavel_informado"> & {
    verification: Pick<CaseView["verification"], "checagens">;
  };
};

/**
 * The six checks (spec AC 30): the backend's titulo, descricao and valor as
 * text, with a status word. A lote case without responsavel_informado
 * shows fila.check.qsa_missing on the QSA row (C-M6-6). Two columns from
 * 32 rem of the detail's own width.
 */
export function CheckList({ view }: Props): JSX.Element {
  const qsaMissing =
    view.origem === "lote" && view.responsavel_informado === undefined;
  return (
    <ul className="grid gap-4 @lg/detail:grid-cols-2">
      {view.verification.checagens.map((check) => (
        <li
          key={check.chave}
          className="flex min-w-0 flex-col gap-1 border-t border-line pt-3"
        >
          <span className="text-secondary">
            <StatusWord status={check.status} />
          </span>
          <p className="text-body font-strong break-words text-ink">
            {check.titulo}
          </p>
          <p className="text-secondary break-words text-ink-muted">
            {check.descricao}
          </p>
          <p className="text-body break-words text-ink">
            {qsaMissing && check.chave === "qsa"
              ? filaCopy["fila.check.qsa_missing"]
              : check.valor}
          </p>
        </li>
      ))}
    </ul>
  );
}
