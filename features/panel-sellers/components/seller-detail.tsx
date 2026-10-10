import Link from "next/link";
import type { JSX } from "react";

import { CheckList } from "@/features/panel-fila/components/check-list";
import { Consulted } from "@/features/panel-fila/components/consulted";
import { ProofDownload } from "@/features/panel-fila/components/proof-download";
import { VerdictHeader } from "@/features/panel-fila/components/verdict-header";
import { filaCopy } from "@/features/panel-fila/copy";
import { ReverifyButton } from "@/features/panel-sellers/components/reverify-button";
import { sellersCopy } from "@/features/panel-sellers/copy";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { formatDate } from "@/features/panel-shell/format";
import type { Seller } from "@/lib/api/schemas/panel/sellers";

const EXHAUSTED_ID = "vendedor-sem-saldo";
const HISTORY_ID = "vendedor-historico";

const VERDICT_WORDS = {
  aprovar: filaCopy["fila.verdict.aprovar"],
  revisar: filaCopy["fila.verdict.revisar"],
  bloquear: filaCopy["fila.verdict.bloquear"],
} as const;

type Props = {
  /** Masked by the data layer (O-F4); every id passed isPanelId at the parse. */
  seller: Seller;
  /** The plan's allowance is used up or none (planGate). */
  exhausted?: boolean;
};

/**
 * The seller detail (spec S10, AC 58, plan-m8 D10): the latest verification
 * with the Fila's read-only parts (VerdictHeader as the page's h1,
 * Consulted, CheckList; no decisions), "Abrir caso" when a case is open,
 * Reverificar, the proof and the history. G9: with no current verification
 * the name heads the page alone and the checks and proof are left out.
 * Server-safe.
 */
export function SellerDetail({
  seller,
  exhausted = false,
}: Props): JSX.Element {
  const current = seller.verificacao_atual;
  const latest =
    seller.verificacoes.find((item) => item.id === current?.id) ??
    seller.verificacoes[0];
  const name = seller.razao_social ?? seller.cnpj;
  return (
    <article className="flex min-w-0 flex-col gap-6">
      {current !== undefined && latest !== undefined ? (
        <VerdictHeader
          heading="h1"
          view={{
            veredito: latest.veredito,
            razao_social: seller.razao_social,
            cnpj: seller.cnpj,
            verification: current,
          }}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-body font-strong break-words text-ink">{name}</h1>
          <p className="text-secondary text-ink-muted tabular-nums">
            {seller.cnpj}
          </p>
        </div>
      )}
      {current !== undefined && (
        <>
          <Consulted view={{ verification: current }} />
          <CheckList
            view={{
              origem: seller.origem,
              responsavel_informado: seller.responsavel,
              verification: current,
            }}
          />
        </>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {seller.case_aberto_id !== undefined && (
          <Link
            href={`/fila/${encodeURIComponent(seller.case_aberto_id)}`}
            className={PANEL_LINK}
          >
            {sellersCopy["sellers.detail.open_case"]}
          </Link>
        )}
        <ReverifyButton
          sellerId={seller.id}
          razaoSocial={seller.razao_social}
          cnpj={seller.cnpj}
          pending={seller.reverificacao_pendente}
          verifiedAt={seller.verificado_em}
          exhausted={exhausted ? { describedBy: EXHAUSTED_ID } : undefined}
        />
        {current !== undefined && (
          <ProofDownload
            href={`/vendedores/${encodeURIComponent(seller.id)}/comprovante`}
          />
        )}
      </div>
      {exhausted && (
        <p id={EXHAUSTED_ID} className="text-secondary text-ink-muted">
          {shellCopy["plan.exhausted"]}
        </p>
      )}
      <section aria-labelledby={HISTORY_ID} className="flex flex-col gap-3">
        <h2 id={HISTORY_ID} className="text-h2 font-title text-ink">
          {sellersCopy["sellers.detail.history.h"]}
        </h2>
        <ul className="flex flex-col">
          {seller.verificacoes.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line py-3"
            >
              <span className="text-body text-ink">
                {VERDICT_WORDS[item.veredito]}
              </span>
              <span className="text-secondary text-ink-muted tabular-nums">
                {formatDate(item.criado_em)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
