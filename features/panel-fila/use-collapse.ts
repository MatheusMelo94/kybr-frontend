"use client";

import type { RefObject } from "react";

export type Collapse = {
  /** Before the optimistic removal: record where each option sits. */
  capture(): void;
  /** After the list re-rendered without the case: close the gap. */
  play(): void;
};

/**
 * The list's collapse when a decided case leaves it (plan-m6 § 7, D12): a
 * WAAPI FLIP over `listRef`'s options, transform and opacity only, none
 * under reduced motion. No GSAP (the user's decision, Q2; the lint fence).
 * T113 ships the interface as a no-op (an instant removal); T114 animates.
 */
const INSTANT: Collapse = { capture() {}, play() {} };

export const useCollapse: (
  listRef: RefObject<HTMLElement | null>,
) => Collapse = () => INSTANT;
