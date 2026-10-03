import type { JSX, ReactNode } from "react";

import { ExternalLink } from "@/components/ui/external-link";
import {
  PRIMARY_ACTION_LINK,
  SECONDARY_ACTION_LINK,
} from "@/features/seller-link/components/case/action-link-styles";
import { blockedCopy } from "@/features/seller-link/copy/blocked";
import { resultsCopy } from "@/features/seller-link/copy/results";
import { sharedCopy } from "@/features/seller-link/copy/shared";
import { fillNode } from "@/features/seller-link/fill-node";
import { fill, formatData } from "@/features/seller-link/format";
import { RazaoSocial } from "@/features/seller-link/razao-social";
import type {
  BlockedReason,
  CaseResult,
  PublicLink,
} from "@/lib/api/schemas/public-link";
import type { SafeHttpsUrl } from "@/lib/safe-url";

type Props = {
  resultado: CaseResult;
  /** The workspace name from D1. */
  marketplace: string;
  /** The marketplace's seller contact from D1: a strict e-mail or an https: URL. */
  contact: PublicLink["contato_vendedor"];
};

const GENERICO: BlockedReason = { codigo: "GENERICO" };

/** The reason line for the code (spec § Não aprovado), with the name masked. */
function reasonFor(
  motivo: BlockedReason,
  razaoSocial: string | undefined,
  responsavel: string,
  marketplace: string,
): ReactNode {
  // The schema already coerces a reason without company data to GENERICO;
  // this keeps any view from rendering an empty {razao_social}.
  if (razaoSocial === undefined || motivo.codigo === "GENERICO")
    return fill(blockedCopy["blocked.reason.GENERICO"], { marketplace });
  const razao_social = <RazaoSocial value={razaoSocial} />;
  switch (motivo.codigo) {
    case "SITUACAO_IRREGULAR":
      return fillNode(blockedCopy["blocked.reason.SITUACAO_IRREGULAR"], {
        razao_social,
        situacao: motivo.situacao,
      });
    case "RESPONSAVEL_NAO_SOCIO":
      return fillNode(blockedCopy["blocked.reason.RESPONSAVEL_NAO_SOCIO"], {
        responsavel,
        razao_social,
      });
    case "MEI":
      return blockedCopy["blocked.reason.MEI"];
    default:
      return fillNode(blockedCopy[`blocked.reason.${motivo.codigo}`], {
        razao_social,
      });
  }
}

/** The regularize CTA, only for its codes and only with a gov.br URL (F14). */
function regularizeCta(
  motivo: BlockedReason,
): { href: SafeHttpsUrl; label: string } | undefined {
  switch (motivo.codigo) {
    case "SITUACAO_IRREGULAR":
      return motivo.url_regularizacao
        ? {
            href: motivo.url_regularizacao,
            label: blockedCopy["blocked.cta.receita"],
          }
        : undefined;
    case "IE_NAO_ENCONTRADA":
    case "IE_SUSPENSA":
      return motivo.url_regularizacao
        ? {
            href: motivo.url_regularizacao,
            label: blockedCopy["blocked.cta.ie"],
          }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * *Não aprovado* (spec AC 25): the reason in plain language, the official
 * regularize link when one exists, the marketplace's contact, and the query
 * date. Without company data only GENERICO shows, and the date is left out.
 */
export function BlockedView({
  resultado,
  marketplace,
  contact,
}: Props): JSX.Element {
  const { razao_social, responsavel, consultado_em } = resultado;
  const motivo =
    razao_social === undefined ? GENERICO : (resultado.motivo ?? GENERICO);
  const regularize = regularizeCta(motivo);
  const contactLabel = fill(blockedCopy["blocked.cta.contact"], {
    marketplace,
  });
  // The contact is the primary action when it's the only one.
  const contactStyle = regularize ? SECONDARY_ACTION_LINK : PRIMARY_ACTION_LINK;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-title">{blockedCopy["blocked.h1"]}</h1>
        <p className="text-body break-words text-ink-muted">
          {reasonFor(motivo, razao_social, responsavel, marketplace)}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {regularize && (
          <ExternalLink
            href={regularize.href}
            srSuffix={sharedCopy["external.sr"]}
            className={PRIMARY_ACTION_LINK}
          >
            {regularize.label}
          </ExternalLink>
        )}
        {contact.tipo === "email" ? (
          // An e-mail contact opens the mail app: same tab, no suffix (plan § 9).
          <a href={`mailto:${contact.valor}`} className={contactStyle}>
            {contactLabel}
          </a>
        ) : (
          <ExternalLink
            href={contact.valor}
            srSuffix={sharedCopy["external.sr"]}
            className={contactStyle}
          >
            {contactLabel}
          </ExternalLink>
        )}
      </div>
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
