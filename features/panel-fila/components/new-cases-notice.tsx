"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { filaCopy } from "@/features/panel-fila/copy";
import type { FilaAba } from "@/features/panel-fila/search-params";
import { fill } from "@/features/panel-shell/format";

type Props = { aba: FilaAba };

/**
 * New cases since the list was shown (AC 40, D3): fila.new.* and "Mostrar",
 * on Para decidir only. The region stays mounted so each count is announced
 * politely; the content fades in with @starting-style (opacity only),
 * instantly under reduced motion. "Mostrar" re-reads the page and resets
 * the snapshot; nothing else refreshes the list.
 */
export function NewCasesNotice({ aba }: Props): JSX.Element {
  const { novos, showNew, online } = useFila();
  const visible = aba === "aberto" && novos > 0;
  return (
    <div role="status" aria-live="polite">
      {visible && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface py-2 pr-2 pl-4 transition-opacity duration-(--duration-base) ease-out-quart motion-reduce:transition-none starting:opacity-0">
          <p className="min-w-0 flex-1 text-secondary text-ink">
            {novos === 1
              ? filaCopy["fila.new.one"]
              : fill(filaCopy["fila.new.other"], { n: novos })}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="panel"
            disabled={!online}
            onClick={showNew}
          >
            {filaCopy["fila.new.cta"]}
          </Button>
        </div>
      )}
    </div>
  );
}
