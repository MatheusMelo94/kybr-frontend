import type { JSX } from "react";

import { cn } from "@/lib/utils";

// The "kybr." wordmark (brand v1; identity.md › Logo): the supplied artwork
// (kybr-logo/svg/kybr-wordmark-ink.svg), paths rounded to one decimal,
// filled with currentColor so it follows --color-ink in both themes. Server-
// safe: no 'use client', no hooks.

const GLYPHS =
  "M370.9 304.4V651.7H401.7L772.3 1056H1117.5L639.2 524.7H571.3ZM104.4 0V1490H398.6V0ZM795.1 0 461.3 459.7 655.8 665.2 1139.7 0ZM1134.3 -418V-184.8H1268.6Q1303.7 -184.8 1326 -173.8Q1348.3 -162.7 1363.9 -138.2Q1379.5 -113.7 1393.2 -73.5L1422.6 4.1L1015.8 1056H1325L1501.7 534.4Q1532.4 441.7 1560.2 348.1Q1588 254.6 1614.6 161.3H1531.8Q1557.3 254.6 1585.1 348.4Q1612.9 442.2 1643.6 534.4L1821.1 1056H2126.9L1662 -162.5Q1628.6 -250.8 1582.4 -307.3Q1536.1 -363.8 1473.7 -390.9Q1411.2 -418 1329.1 -418Q1281.5 -418 1231.7 -418Q1181.9 -418 1134.3 -418ZM2724.2 -22.2Q2655.2 -22.2 2595.3 -1.8Q2535.5 18.5 2488.6 59.5Q2441.7 100.6 2411.3 162.2H2409.8V0H2119.6V1490H2413.8V909.7H2415.3Q2449.3 967.1 2495.4 1004.2Q2541.6 1041.3 2600 1059.7Q2658.4 1078.2 2726.4 1078.2Q2861.7 1078.2 2963.9 1008.6Q3066.1 939.1 3123.6 815.3Q3181.2 691.5 3181.2 529.1Q3181.2 363.8 3124.4 239.8Q3067.7 115.8 2965.2 46.8Q2862.8 -22.2 2724.2 -22.2ZM2648 217.8Q2720 217.8 2772.8 254.4Q2825.5 291 2854.7 360.7Q2883.9 430.3 2883.9 529.1Q2883.9 628.3 2854.7 697.4Q2825.5 766.5 2772.8 803.1Q2720 839.8 2648 839.8Q2573.8 839.8 2517.7 801.3Q2461.6 762.8 2430.7 693.3Q2399.8 623.7 2399.8 529.1Q2399.8 434.9 2430.7 364.8Q2461.6 294.7 2517.7 256.2Q2573.8 217.8 2648 217.8ZM3220.8 0V1056H3504.8V876H3507.7Q3536.7 971.5 3598.6 1017.4Q3660.6 1063.4 3765 1063.4Q3791.2 1063.4 3812.9 1062.4Q3834.5 1061.5 3852.1 1060.6V809.6Q3836.1 811 3799.5 813.1Q3762.9 815.1 3725.4 815.1Q3665.2 815.1 3617.4 787.6Q3569.6 760 3542.3 706Q3515 652 3515 572.2V0Z";

/** The lockup's width and its left clear space, in viewBox units (geometry, not style). */
const LOCKUP_WIDTH = 4964;
const CLEAR_SPACE_LEFT = 409.6;

const VIEW_BOX = {
  // The source viewBox: the clear space (2 × the dot) is part of the lockup.
  lockup: "0 0 4964 2727",
  // Tight around the glyphs: ascender top 409.6, descender bottom 2317.6.
  inline: "409.6 409.6 4144.6 1908",
} as const;

type Props = {
  variant: "lockup" | "inline";
  "aria-label"?: string;
  /** lockup only: the rendered width in px (at least 64); the height follows the viewBox. */
  width?: number;
  /**
   * lockup only: pull it left by its own clear space, so the glyphs line up
   * with the text column's edge. Nothing enters the clear space: it just
   * hangs into the column's padding.
   */
  alignGlyphs?: boolean;
  className?: string;
};

/**
 * lockup: sized by width (minimum 64 px). inline: a typographic signature
 * set at the surrounding text's size. The outlines are Inter 700 at 2048
 * units per em, so 1908 units tall = 0.93 em, and the baseline sits 418
 * units (0.2 em) above the bottom: it shares the text's cap height and
 * baseline. Those two em values are geometry, not style tokens.
 */
export function Wordmark({
  variant,
  "aria-label": label = "Kybr",
  width,
  alignGlyphs = false,
  className,
}: Props): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEW_BOX[variant]}
      role="img"
      aria-label={label}
      focusable="false"
      width={width}
      style={
        alignGlyphs && width !== undefined
          ? { marginLeft: -(CLEAR_SPACE_LEFT / LOCKUP_WIDTH) * width }
          : undefined
      }
      className={cn(
        variant === "inline" && "inline-block h-[0.93em] w-auto align-[-0.2em]",
        className,
      )}
    >
      <g transform="translate(305.2,1899.6) scale(1,-1)">
        <path d={GLYPHS} fill="currentColor" />
        <circle cx="4054.4" cy="194.6" r="194.6" fill="currentColor" />
      </g>
    </svg>
  );
}
