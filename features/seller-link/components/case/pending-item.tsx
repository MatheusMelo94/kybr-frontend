import type { JSX, ReactNode } from "react";

import { ExternalLink } from "@/components/ui/external-link";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import { sharedCopy } from "@/features/seller-link/copy/shared";
import { fill } from "@/features/seller-link/format";
import type { CaseItem } from "@/lib/api/schemas/public-link";
import type { SafeHttpsUrl } from "@/lib/safe-url";

type Props = {
  item: CaseItem;
  /** The name as the seller typed it, for DOCUMENTO_RESPONSAVEL's title. */
  responsavel: string;
  /** The title's id, which the item's action uses as its description. */
  titleId: string;
  /** The item's action slot (the document upload, T30). */
  children?: ReactNode;
};

type ItemCopy = {
  title: string;
  description: string;
  regularize?: SafeHttpsUrl | undefined;
};

/** The seller-facing title and description for the item's code (spec § Quase lá). */
function itemCopy(item: CaseItem, responsavel: string): ItemCopy {
  switch (item.codigo) {
    case "DOCUMENTO_RESPONSAVEL":
      return {
        title: fill(pendingCopy["pending.item.DOCUMENTO_RESPONSAVEL.title"], {
          responsavel,
        }),
        description:
          pendingCopy["pending.item.DOCUMENTO_RESPONSAVEL.description"],
      };
    case "DOCUMENTO_SOLICITADO":
      return {
        title: fill(pendingCopy["pending.item.DOCUMENTO_SOLICITADO.title"], {
          documento: pendingCopy[`documento.${item.documento_tipo}`],
        }),
        description:
          pendingCopy["pending.item.DOCUMENTO_SOLICITADO.description"],
      };
    case "SITUACAO_IRREGULAR":
      return {
        title: fill(pendingCopy["pending.item.SITUACAO_IRREGULAR.title"], {
          situacao: item.situacao,
        }),
        description: pendingCopy["pending.item.SITUACAO_IRREGULAR.description"],
        regularize: item.url_regularizacao,
      };
    case "IE_NAO_ENCONTRADA":
    case "IE_SUSPENSA":
      return {
        title: pendingCopy[`pending.item.${item.codigo}.title`],
        description: pendingCopy[`pending.item.${item.codigo}.description`],
        regularize: item.url_regularizacao,
      };
    case "EMPRESA_RECENTE":
      return {
        title:
          item.dias === 1
            ? pendingCopy["pending.item.EMPRESA_RECENTE.title.one"]
            : fill(pendingCopy["pending.item.EMPRESA_RECENTE.title.many"], {
                dias: item.dias,
              }),
        description: pendingCopy["pending.item.EMPRESA_RECENTE.description"],
      };
    case "ATIVIDADE_FORA_DA_CATEGORIA":
    case "MEI":
      return {
        title: pendingCopy[`pending.item.${item.codigo}.title`],
        description: pendingCopy[`pending.item.${item.codigo}.description`],
      };
  }
}

/**
 * One *quase lá* row: what's missing in plain language, with the official
 * "Como regularizar" link when the backend sent a gov.br URL, and the
 * document upload in its slot.
 */
export function PendingItem({
  item,
  responsavel,
  titleId,
  children,
}: Props): JSX.Element {
  const { title, description, regularize } = itemCopy(item, responsavel);
  return (
    <li className="flex flex-col gap-1 py-4">
      <h2 id={titleId} className="text-body font-strong break-words text-ink">
        {title}
      </h2>
      <p className="text-secondary text-ink-muted">{description}</p>
      {regularize && (
        <ExternalLink
          href={regularize}
          srSuffix={sharedCopy["external.sr"]}
          className="self-start text-secondary"
        >
          {pendingCopy["pending.item.regularize"]}
        </ExternalLink>
      )}
      {children}
    </li>
  );
}
