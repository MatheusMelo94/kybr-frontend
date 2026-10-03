import type { JSX, ReactNode } from "react";

import { caseCopy } from "@/features/seller-link/copy/case";

type Props = {
  /** timeout: still processing after 10 s. notfound: DADOS_NAO_ENCONTRADOS (spec v3). */
  variant: "timeout" | "notfound";
  /** The contact e-mail block (ContactEmailBlock, T29). */
  emailBlock?: ReactNode;
};

const BODY = {
  timeout: caseCopy["analysis.body.timeout"],
  notfound: caseCopy["analysis.body.notfound"],
} as const;

/**
 * *Em análise* (spec AC 17, AC 18): the seller can leave, and the result comes
 * by e-mail. Nothing here uses {razao_social} or results.consulted.
 */
export function AnalysisView({ variant, emailBlock }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="text-title font-title">
          {caseCopy["analysis.h1"]}
        </h1>
        <p className="text-body text-ink-muted">{BODY[variant]}</p>
      </div>
      {emailBlock}
      <p className="text-body text-ink">{caseCopy["analysis.resume"]}</p>
    </div>
  );
}
