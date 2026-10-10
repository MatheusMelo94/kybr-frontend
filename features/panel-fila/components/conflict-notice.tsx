"use client";

import type { JSX } from "react";

import { useFila } from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import { formatDataHora } from "@/features/panel-shell/format";
import { fill } from "@/features/panel-shell/format";

type Props = {
  caseId: string;
  /** The decision's time as the case shows it, when the 409 had none. */
  decididoEm: string | undefined;
};

/**
 * The conflict flash (AC 35): this case had been decided elsewhere when
 * Renata decided it. Next to DecidedBanner, which shows the decision. The
 * polite region mounts with the detail and only its text changes, so the
 * conflict is announced (P6-003; plan § 8).
 */
export function ConflictNotice({ caseId, decididoEm }: Props): JSX.Element {
  const { flash } = useFila();
  const conflict = flash[caseId];
  const em =
    conflict?.kind === "conflict"
      ? (conflict.decididoEm ?? decididoEm)
      : undefined;
  return (
    <div data-fila-conflict aria-live="polite">
      {em !== undefined && (
        <p className="text-body text-ink tabular-nums">
          {fill(filaCopy["fila.decide.conflict"], {
            data_hora: formatDataHora(em),
          })}
        </p>
      )}
    </div>
  );
}
