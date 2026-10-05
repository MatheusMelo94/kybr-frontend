import type { JSX } from "react";

import type { Batch } from "@/lib/api/schemas/panel/batches";

type Contagens = Batch["contagens"];

// A circle whose circumference is 100, so dash lengths are percentages.
const RADIUS = 15.9155;

const ARCS: { key: keyof Contagens; stroke: string }[] = [
  { key: "ok", stroke: "stroke-success" },
  { key: "warn", stroke: "stroke-warning" },
  { key: "bad", stroke: "stroke-danger" },
  { key: "erro", stroke: "stroke-ink-muted" },
];

/**
 * The result's donut (spec § Motion Intent): decorative (aria-hidden), the
 * legend carries every number. Each arc draws once from @starting-style in
 * --duration-slow (450 ms); under reduced motion it renders final at once.
 * The dash values are presentation attributes, so the starting style wins
 * the first frame and the transition runs to them.
 */
export function BatchDonut({
  contagens,
}: {
  contagens: Contagens;
}): JSX.Element {
  const total = ARCS.reduce((sum, arc) => sum + contagens[arc.key], 0);
  let start = 0;
  return (
    <svg
      viewBox="0 0 42 42"
      aria-hidden="true"
      focusable="false"
      className="size-36 shrink-0"
    >
      <circle
        cx="21"
        cy="21"
        r={RADIUS}
        fill="none"
        strokeWidth="6"
        className="stroke-field"
      />
      <g transform="rotate(-90 21 21)">
        {ARCS.filter((arc) => contagens[arc.key] > 0).map((arc) => {
          const share = total === 0 ? 0 : (contagens[arc.key] / total) * 100;
          const offset = -start;
          start += share;
          return (
            <circle
              key={arc.key}
              data-arc={arc.key}
              cx="21"
              cy="21"
              r={RADIUS}
              fill="none"
              strokeWidth="6"
              strokeDasharray={`${share} ${100 - share}`}
              strokeDashoffset={offset}
              className={`${arc.stroke} transition-[stroke-dasharray] duration-(--duration-slow) ease-out-quart motion-reduce:transition-none starting:[stroke-dasharray:0_100]`}
            />
          );
        })}
      </g>
    </svg>
  );
}
