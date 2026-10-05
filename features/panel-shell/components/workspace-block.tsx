import type { JSX } from "react";

import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";

type Props = {
  nome: string;
  /** contagens.vendedores, when /me had it. Zero or missing hides the line. */
  vendedores: number | undefined;
};

/** The workspace's name and seller count (spec S5). */
export function WorkspaceBlock({ nome, vendedores }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body font-strong break-words text-ink">{nome}</p>
      {vendedores !== undefined && vendedores > 0 && (
        <p className="text-secondary text-ink-muted tabular-nums">
          {fill(plural(shellCopy, "ws.sellers", vendedores), {
            n: formatNumber(vendedores),
          })}
        </p>
      )}
    </div>
  );
}
