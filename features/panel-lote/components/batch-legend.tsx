import type { JSX } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { STATUS_WORDS } from "@/features/panel-lote/components/status-word";
import { formatNumber } from "@/features/panel-shell/format";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Contagens = Batch["contagens"];

// "Não consultados" isn't a verdict: a neutral dot (plan M5 styling).
const ITEMS = (["ok", "warn", "bad", "erro"] as const).map((key) => ({
  key,
  ...STATUS_WORDS[key],
}));

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
