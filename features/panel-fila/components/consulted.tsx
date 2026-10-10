import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { formatDataHora } from "@/features/panel-shell/format";
import { fill } from "@/features/panel-shell/format";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = {
  view: Pick<CaseView, "consultado_em"> & {
    verification: Pick<CaseView["verification"], "modo" | "criado_em">;
  };
};

/** When the data was read (spec S6): fila.consulted, or .cache for stored data. */
export function Consulted({ view }: Props): JSX.Element {
  const key =
    view.verification.modo === "cache"
      ? "fila.consulted.cache"
      : "fila.consulted";
  return (
    <p className="text-secondary text-ink-muted tabular-nums">
      {fill(filaCopy[key], {
        data_hora: formatDataHora(
          view.consultado_em ?? view.verification.criado_em,
        ),
      })}
    </p>
  );
}
