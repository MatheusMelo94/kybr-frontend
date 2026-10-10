"use client";

import type { JSX } from "react";

import { Notice } from "@/components/panel/notice";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";

type Props = { caseId: string };

/**
 * The decide-error flash (AC 34; plan-m6 § 3.3): a failed or unknown
 * decision, shown in place on its case, above the actions. Never a toast
 * (DC § Anti-Patterns).
 */
export function DecideError({ caseId }: Props): JSX.Element | null {
  const { flash } = useFila();
  if (flash[caseId]?.kind !== "decide-error") return null;
  // DDR-0003 pt 4: ink text with the danger bar; red text is for form
  // fields and form alerts only (P6-013).
  return (
    <Notice role="alert" tone="danger">
      {filaCopy["fila.decide.error"]}
    </Notice>
  );
}
