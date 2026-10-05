import type { JSX } from "react";

// The Kybr symbol (brand v1; identity.md › Symbol): the "k" on a tile with a
// 25 % radius, from kybr-logo/svg/kybr-favicon.svg (dotless) and
// kybr-symbol-dark.svg (with the dot), paths rounded to one decimal. The
// tile is ink and the glyph surface, so it inverts in dark. Panel-only (the
// sidebar); server-safe: no 'use client', no hooks.

const K =
  "M370.9 304.4V651.7H401.7L772.3 1056H1117.5L639.2 524.7H571.3ZM104.4 0V1490H398.6V0ZM795.1 0 461.3 459.7 655.8 665.2 1139.7 0Z";

/** Below this size the dot disappears (identity.md › Minimum sizes [guide rule]). */
const DOT_FROM = 64;

type Props = {
  size: number;
  "aria-label"?: string;
};

export function KybrSymbol({
  size,
  "aria-label": label = "Kybr",
}: Props): JSX.Element {
  const dotted = size >= DOT_FROM;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      focusable="false"
      className="shrink-0"
    >
      <rect width="1024" height="1024" rx="256" className="fill-ink" />
      {dotted ? (
        <g
          transform="translate(201.4,780.2) scale(0.36,-0.36)"
          className="fill-surface"
        >
          <path d={K} />
          <circle cx="1426.4" cy="194.6" r="194.6" />
        </g>
      ) : (
        <g
          transform="translate(269.4,802.5) scale(0.39,-0.39)"
          className="fill-surface"
        >
          <path d={K} />
        </g>
      )}
    </svg>
  );
}
