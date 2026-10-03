import type { JSX } from "react";

import { RestartLink } from "@/features/seller-link/components/case/restart-link";
import { caseCopy } from "@/features/seller-link/copy/case";

/**
 * Case not found: an unknown or malformed token, or a token from another slug
 * (spec AC 27). The same screen for all of them, so it reveals nothing about
 * whether a case or a CNPJ exists.
 */
export function CaseNotFound(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-title">{caseCopy["casenotfound.h1"]}</h1>
      <p className="text-body text-ink-muted">
        {caseCopy["casenotfound.body"]}
      </p>
      <RestartLink />
    </div>
  );
}
