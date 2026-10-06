import type { JSX } from "react";

import { FilaSoftLink } from "@/features/panel-fila/components/fila-soft-link";
import { filaCopy } from "@/features/panel-fila/copy";
import { filaHref, type FilaAba } from "@/features/panel-fila/search-params";
import { fill } from "@/features/panel-shell/format";
import type { Contagens } from "@/lib/api/schemas/panel/me";
import { cn } from "@/lib/utils";

/** The active tab's id: it names the case listbox. */
export const FILA_TAB_ACTIVE_ID = "fila-aba-ativa";

type Props = {
  aba: FilaAba;
  /** /me's counts; a missing count → the count-less key (G13). */
  contagens: Contagens | undefined;
};

const TAB =
  "inline-flex min-h-10 items-center border-b-2 px-1 text-body tabular-nums pointer-coarse:min-h-11 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Para decidir / Aguardando vendedor: soft links to ?aba= (plan D2, AC 27). */
export function FilaTabs({ aba, contagens }: Props): JSX.Element {
  const tabs = [
    {
      aba: "aberto",
      n: contagens?.fila_abertos,
      key: "fila.tab.open",
    },
    {
      aba: "aguardando",
      n: contagens?.fila_aguardando,
      key: "fila.tab.waiting",
    },
  ] as const;
  return (
    <div data-fila-tabs className="flex flex-wrap gap-x-6 border-b border-line">
      {tabs.map((tab) => {
        const active = tab.aba === aba;
        return (
          <FilaSoftLink
            key={tab.aba}
            href={filaHref("/fila", { aba: tab.aba, ate: 25 })}
            id={active ? FILA_TAB_ACTIVE_ID : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              TAB,
              active
                ? "border-ink font-strong text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {tab.n === undefined
              ? filaCopy[`${tab.key}.nocount`]
              : fill(filaCopy[tab.key], { n: tab.n })}
          </FilaSoftLink>
        );
      })}
    </div>
  );
}
