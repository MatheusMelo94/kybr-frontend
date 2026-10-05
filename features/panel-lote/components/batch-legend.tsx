import type { JSX } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { loteCopy } from "@/features/panel-lote/copy";
import { formatNumber } from "@/features/panel-shell/format";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Contagens = Batch["contagens"];

const ITEMS: { key: keyof Contagens; word: string; tone: StatusTone }[] = [
  { key: "ok", word: loteCopy["lote.legend.ok"], tone: "success" },
  { key: "warn", word: loteCopy["lote.legend.warn"], tone: "warning" },
  { key: "bad", word: loteCopy["lote.legend.bad"], tone: "danger" },
  // Not a verdict: a neutral dot (plan M5 styling).
  { key: "erro", word: loteCopy["lote.legend.err"], tone: "neutral" },
];

/**
 * The result's legend (AC 20, 69, 71): every status as a dot (decorative), its
 * word in ink and its number in text, so grayscale loses nothing (DDR-0003).
 * "Não consultados" only when some rows weren't checked (AC 21).
 */
export function BatchLegend({
  contagens,
}: {
  contagens: Contagens;
}): JSX.Element {
  return (
    <ul className="flex flex-col gap-2">
      {ITEMS.filter((item) => item.key !== "erro" || contagens.erro > 0).map(
        (item) => (
          <li
            key={item.key}
            className="flex items-center gap-2 text-body text-ink"
          >
            <StatusDot tone={item.tone} />
            <span>{item.word}</span>
            <span className="ml-auto tabular-nums">
              {formatNumber(contagens[item.key])}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}
