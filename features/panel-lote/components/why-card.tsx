import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Props = {
  /** A finished batch's breakdown (contract C1); missing or all zero → the generic card. */
  motivos?: Batch["motivos_contagem"];
};

const REAL = [
  { key: "inapta_baixada", base: "lote.why.bad", desc: "lote.why.bad.desc" },
  { key: "sem_ie", base: "lote.why.ie", desc: "lote.why.ie.desc" },
  { key: "cnae_fora", base: "lote.why.cnae", desc: "lote.why.cnae.desc" },
] as const;

/** "O que isso resolve" (S7): the generic lines, or a finished batch's real counts. */
export function WhyCard({ motivos }: Props): JSX.Element {
  const items = REAL.filter((item) => (motivos?.[item.key] ?? 0) > 0);
  return (
    <section
      aria-labelledby="lote-why-h"
      className="flex flex-col gap-3 rounded-lg border border-line p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="lote-why-h" className="text-h2 font-title text-ink">
          {loteCopy["lote.why.h"]}
        </h2>
        <p className="text-secondary text-ink-muted">
          {loteCopy["lote.why.sub"]}
        </p>
      </div>
      {items.length === 0 ? (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink">
          <li>{loteCopy["lote.why.generic.1"]}</li>
          <li>{loteCopy["lote.why.generic.2"]}</li>
          <li>{loteCopy["lote.why.generic.3"]}</li>
        </ul>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const n = motivos?.[item.key] ?? 0;
            return (
              <li key={item.key} className="flex flex-col gap-0.5">
                <p className="text-body font-strong text-ink tabular-nums">
                  {fill(plural(loteCopy, item.base, n), { n: formatNumber(n) })}
                </p>
                <p className="text-secondary text-ink-muted">
                  {loteCopy[item.desc]}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
