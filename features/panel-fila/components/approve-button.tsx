"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { filaCopy } from "@/features/panel-fila/copy";
import { useDecide, type QuickDecisao } from "@/features/panel-fila/use-decide";

type Props = {
  caseId: string;
  decisao: QuickDecisao;
  /** The toast's {razao_social}: the masked CNPJ when there is none (G3). */
  razao: string;
  /** Offline (T111): the trigger is disabled and described by offline.actions. */
  offline?: { disabled: true; describedBy: string } | undefined;
  /** The action bar's placement (T112: full width below lg). */
  className?: string;
};

/** fila.action.approve, or .keep on an alert: one click, no confirmation (AC 31). */
export function ApproveButton({
  caseId,
  decisao,
  razao,
  offline,
  className,
}: Props): JSX.Element {
  const { decide, busy } = useDecide();
  return (
    <Button
      type="button"
      busy={busy}
      disabled={offline?.disabled}
      aria-describedby={offline?.describedBy}
      onClick={() => decide(caseId, decisao, razao)}
      {...(className !== undefined && { className })}
    >
      {
        filaCopy[
          decisao === "manter" ? "fila.action.keep" : "fila.action.approve"
        ]
      }
    </Button>
  );
}
