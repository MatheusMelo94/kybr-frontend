import { useId, type JSX } from "react";

import { SectionHeading } from "@/features/panel-fila/components/section-heading";
import { filaCopy } from "@/features/panel-fila/copy";
import { fill } from "@/features/panel-shell/format";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = { view: CaseView };

/**
 * The seller (spec AC 29): the responsável as given, the platform's ext_id
 * with its warning (anyone can edit it), and whether they left an e-mail.
 * Never the address itself (F11).
 */
export function SellerBlock({ view }: Props): JSX.Element {
  const helpId = useId();
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{filaCopy["fila.seller.h"]}</SectionHeading>
      {view.responsavel_informado !== undefined && (
        <p className="text-body break-words text-ink">
          {fill(filaCopy["fila.seller.responsavel"], {
            nome: view.responsavel_informado,
          })}
        </p>
      )}
      {view.ext_id !== undefined && (
        <>
          <p
            aria-describedby={helpId}
            className="text-body break-words text-ink"
          >
            {fill(filaCopy["fila.seller.extid"], { ext_id: view.ext_id })}
          </p>
          <p id={helpId} className="text-secondary text-ink-muted">
            {filaCopy["fila.seller.extid.help"]}
          </p>
        </>
      )}
      <p className="text-body text-ink-muted">
        {view.vendedor_tem_email
          ? filaCopy["fila.seller.email.yes"]
          : filaCopy["fila.seller.email.no"]}
      </p>
    </section>
  );
}
