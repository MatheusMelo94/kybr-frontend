import type { JSX } from "react";

import { ConfirmationRow } from "@/features/seller-link/components/case/confirmation-row";
import { Seal } from "@/features/seller-link/components/case/seal";
import { resultsCopy } from "@/features/seller-link/copy/results";
import { fillNode } from "@/features/seller-link/fill-node";
import { fill, formatData, primeiroNome } from "@/features/seller-link/format";
import { RazaoSocial } from "@/features/seller-link/razao-social";
import type { CaseResult, Confirmation } from "@/lib/api/schemas/public-link";

type Props = {
  resultado: CaseResult;
  /** The workspace name from D1, for approved.next. */
  marketplace: string;
};

/** The confirmation rows in spec order, whatever order the API sends. */
const ROW_ORDER = [
  "SITUACAO_ATIVA",
  "IE_ATIVA",
  "RESPONSAVEL_CONFERE",
] as const satisfies readonly Confirmation["codigo"][];

function rowCopy(confirmation: Confirmation): { label: string; value: string } {
  switch (confirmation.codigo) {
    case "SITUACAO_ATIVA":
      return {
        label: resultsCopy["approved.row.situacao.label"],
        value: resultsCopy["approved.row.situacao.value"],
      };
    case "IE_ATIVA":
      return {
        label: resultsCopy["approved.row.ie.label"],
        value: fill(resultsCopy["approved.row.ie.value"], {
          uf: confirmation.uf,
        }),
      };
    case "RESPONSAVEL_CONFERE":
      return {
        label: resultsCopy["approved.row.responsavel.label"],
        value: resultsCopy["approved.row.responsavel.value"],
      };
  }
}

/**
 * *Tudo certo* (spec AC 19, AC 18): the seal, the first name, the company,
 * only the confirmations returned, the query date and the way back to the
 * marketplace. Without company data, approved.body.nodata replaces the body
 * and the query date is left out, so no line renders an empty {razao_social}.
 */
export function ApprovedView({ resultado, marketplace }: Props): JSX.Element {
  const { razao_social, consultado_em, responsavel } = resultado;
  const confirmations = ROW_ORDER.flatMap(
    (codigo) =>
      resultado.confirmacoes?.find((row) => row.codigo === codigo) ?? [],
  );

  return (
    <div className="flex flex-col gap-6">
      <Seal />
      <div className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="text-title font-title break-words">
          {fill(resultsCopy["approved.h1"], {
            primeiro_nome: primeiroNome(responsavel),
          })}
        </h1>
        <p className="text-body break-words text-ink-muted">
          {razao_social === undefined
            ? resultsCopy["approved.body.nodata"]
            : fillNode(resultsCopy["approved.body"], {
                razao_social: <RazaoSocial value={razao_social} />,
              })}
        </p>
      </div>
      {confirmations.length > 0 && (
        // Outlined, not raised: the success pills keep the contrast the spec
        // measured on surface (axe: success-ink on its tint over
        // surface-raised falls under 4.5:1).
        <ul className="divide-y divide-line rounded-xl border border-line px-4">
          {confirmations.map((confirmation) => (
            <ConfirmationRow
              key={confirmation.codigo}
              {...rowCopy(confirmation)}
            />
          ))}
        </ul>
      )}
      {consultado_em !== undefined && (
        <p className="text-secondary text-ink-muted">
          {fill(resultsCopy["results.consulted"], {
            data: formatData(consultado_em),
          })}
        </p>
      )}
      <p className="text-body text-ink">
        {fill(resultsCopy["approved.next"], { marketplace })}
      </p>
    </div>
  );
}
