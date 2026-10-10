import type { JSX } from "react";

import { SectionHeading } from "@/features/panel-fila/components/section-heading";
import { filaCopy } from "@/features/panel-fila/copy";
import { formatRelativo } from "@/features/panel-shell/format";
import { fill } from "@/features/panel-shell/format";
import type { CaseEvent } from "@/lib/api/schemas/panel/cases";

type Props = {
  eventos: readonly CaseEvent[];
  /** The render's clock, for the relative dates. */
  now: Date;
};

function eventText(evento: CaseEvent): string {
  switch (evento.tipo) {
    case "caso_criado":
      return filaCopy[`fila.event.criado.${evento.dados.origem}`];
    case "documento_pedido":
      return fill(filaCopy["fila.event.documento_pedido"], {
        documentos: evento.dados.tipos
          .map((tipo) => filaCopy[`documento.${tipo}`])
          .join(", "),
      });
    case "documento_recebido":
      return fill(filaCopy["fila.event.documento_recebido"], {
        documento: filaCopy[`documento.${evento.dados.tipo}`],
      });
    case "decidido":
      return fill(filaCopy["fila.event.decidido"], {
        decisao: filaCopy[`fila.decision.${evento.dados.decisao}`],
      });
    case "reverificado":
      return filaCopy["fila.event.reverificado"];
  }
}

/** The case's history (spec AC 29, G1): newest first, relative dates. */
export function Timeline({ eventos, now }: Props): JSX.Element {
  const sorted = [...eventos].sort(
    (a, b) => Date.parse(b.em) - Date.parse(a.em),
  );
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{filaCopy["fila.history.h"]}</SectionHeading>
      <ol className="flex flex-col gap-2">
        {sorted.map((evento, i) => (
          <li
            key={`${evento.tipo}-${evento.em}-${i}`}
            className="flex flex-wrap justify-between gap-x-4"
          >
            <span className="text-body text-ink">{eventText(evento)}</span>
            <span className="text-secondary text-ink-muted tabular-nums">
              {formatRelativo(evento.em, now)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
