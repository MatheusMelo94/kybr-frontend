"use client";

import type { JSX } from "react";

import { useFila } from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import { formatDataHora } from "@/features/panel-fila/format";
import { fill } from "@/features/panel-shell/format";

type Props = {
  caseId: string;
  /** The decision's time as the case shows it, when the 409 had none. */
  decididoEm: string | undefined;
};

/**
 * The conflict flash (AC 35): this case had been decided elsewhere when
 * Renata decided it. Next to DecidedBanner, which shows the decision.
 */
export function ConflictNotice({
  caseId,
  decididoEm,
}: Props): JSX.Element | null {
  const { flash } = useFila();
  const conflict = flash[caseId];
  if (conflict?.kind !== "conflict") return null;
  const em = conflict.decididoEm ?? decididoEm;
  if (em === undefined) return null;
  return (
    <p className="text-body text-ink">
      {fill(filaCopy["fila.decide.conflict"], {
        data_hora: formatDataHora(em),
      })}
    </p>
  );
}
