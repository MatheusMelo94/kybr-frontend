import type { JSX, ReactNode } from "react";

import { PendingItem } from "@/features/seller-link/components/case/pending-item";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import { resultsCopy } from "@/features/seller-link/copy/results";
import { fillNode } from "@/features/seller-link/fill-node";
import {
  fill,
  formatData,
  formatDataHora,
} from "@/features/seller-link/format";
import { RazaoSocial } from "@/features/seller-link/razao-social";
import type {
  CaseItem,
  CaseResult,
  DocumentItem,
} from "@/lib/api/schemas/public-link";

type Props = {
  resultado: CaseResult;
  /**
   * The action slot of each document item (DocumentUpload, T30), with the id
   * of the item's title for its description.
   */
  documentAction?: (item: DocumentItem, titleId: string) => ReactNode;
  /** The contact e-mail block (ContactEmailBlock, T29), after the items. */
  emailBlock?: ReactNode;
};

function isDocumentItem(item: CaseItem): item is DocumentItem {
  return (
    item.codigo === "DOCUMENTO_RESPONSAVEL" ||
    item.codigo === "DOCUMENTO_SOLICITADO"
  );
}

/** AC 23: every requested document has at least one file. */
function allDocumentsReceived(items: readonly CaseItem[]): boolean {
  const documents = items.filter(isDocumentItem);
  return (
    documents.length > 0 &&
    documents.every((item) => item.documentos_enviados >= 1)
  );
}

/**
 * *Quase lá* (spec AC 20, AC 23, AC 18): what's missing, one row per item,
 * then the e-mail block, the review deadline (or "recebemos tudo" once every
 * requested document has a file) and the query date as the last line. Without
 * company data, pending.body.nodata replaces the body and the date is left out.
 */
export function PendingView({
  resultado,
  documentAction,
  emailBlock,
}: Props): JSX.Element {
  const {
    razao_social,
    responsavel,
    consultado_em,
    prazo_revisao,
    itens = [],
  } = resultado;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="text-title font-title">
          {pendingCopy["pending.h1"]}
        </h1>
        <p className="text-body break-words text-ink-muted">
          {razao_social === undefined
            ? pendingCopy["pending.body.nodata"]
            : fillNode(pendingCopy["pending.body"], {
                razao_social: <RazaoSocial value={razao_social} />,
              })}
        </p>
      </div>
      {itens.length > 0 && (
        <ul className="divide-y divide-line rounded-xl bg-surface-raised px-4">
          {itens.map((item, index) => (
            // Items have no id and a code can repeat: the position is the identity.
            <PendingItem
              key={index}
              item={item}
              responsavel={responsavel}
              titleId={`pending-item-${index}`}
            >
              {isDocumentItem(item) &&
                documentAction?.(item, `pending-item-${index}`)}
            </PendingItem>
          ))}
        </ul>
      )}
      {emailBlock}
      {prazo_revisao !== undefined && (
        <p className="text-body text-ink">
          {fill(
            pendingCopy[
              allDocumentsReceived(itens)
                ? "pending.allreceived"
                : "pending.deadline"
            ],
            { data_hora: formatDataHora(prazo_revisao) },
          )}
        </p>
      )}
      {consultado_em !== undefined && (
        <p className="text-secondary text-ink-muted">
          {fill(resultsCopy["results.consulted"], {
            data: formatData(consultado_em),
          })}
        </p>
      )}
    </div>
  );
}
