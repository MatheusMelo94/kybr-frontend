import type { JSX } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { CountsPill } from "@/features/panel-fila/components/counts-pill";
import { filaCopy } from "@/features/panel-fila/copy";
import type { CaseView } from "@/lib/api/panel/cases";
import { cn } from "@/lib/utils";

const VERDICTS: Record<
  CaseView["veredito"],
  { word: string; tone: StatusTone }
> = {
  aprovar: { word: filaCopy["fila.verdict.aprovar"], tone: "success" },
  revisar: { word: filaCopy["fila.verdict.revisar"], tone: "warning" },
  bloquear: { word: filaCopy["fila.verdict.bloquear"], tone: "danger" },
};

const NAME = "text-body font-strong text-ink focus:outline-none";

type Props = { view: CaseView };

/**
 * The case's header (identity.md § VerdictHeader, spec AC 29): the ≈ 16 px
 * dot and the verdict word in Veredito type (fila.nodata.title for
 * DADOS_NAO_ENCONTRADOS), the razão social (the masked CNPJ when it's null,
 * G3), the CNPJ, and the counts. D9: the name is the h1 below lg and an h2
 * at lg; exactly one is displayed, and both take focus after an open.
 */
export function VerdictHeader({ view }: Props): JSX.Element {
  const noData = view.variante === "DADOS_NAO_ENCONTRADOS";
  const { word, tone } = VERDICTS[view.veredito];
  const name = view.razao_social ?? view.cnpj;
  // AC 76: the masked CNPJ standing in for the name is read in columns too.
  const heading = cn(
    NAME,
    "break-words",
    view.razao_social === null && "tabular-nums",
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-3">
        {/* ≈ 16 px: the class lives here, so /v/*'s CSS doesn't get it. */}
        <StatusDot tone={noData ? "neutral" : tone} className="size-4" />
        <span className="sr-only">{filaCopy["fila.verdict.sr"]} </span>
        <span className="text-verdict font-title text-ink">
          {noData ? filaCopy["fila.nodata.title"] : word}
        </span>
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <h1
          data-detail-heading
          tabIndex={-1}
          className={cn(heading, "lg:hidden")}
        >
          {name}
        </h1>
        <h2
          data-detail-heading
          tabIndex={-1}
          className={cn(heading, "max-lg:hidden")}
        >
          {name}
        </h2>
        <p className="text-secondary text-ink-muted tabular-nums">
          {view.cnpj}
        </p>
      </div>
      {!noData && <CountsPill checagens={view.verification.checagens} />}
    </div>
  );
}
