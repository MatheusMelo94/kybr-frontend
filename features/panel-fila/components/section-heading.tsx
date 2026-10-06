import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** Focus targets carry tabIndex -1 and data-section-heading. */
  focusable?: boolean;
};

const BASE = "text-body font-strong text-ink";

/**
 * A case section's heading, one level under the case's name (D9, P6-002):
 * the name is the h1 below lg (the list title is display: none) and an h2 at
 * lg, so the section is an h2 below lg and an h3 at lg. Both render; exactly
 * one is displayed, the other is display: none and out of the outline.
 */
export function SectionHeading({
  children,
  focusable = false,
}: Props): JSX.Element {
  const focus = focusable
    ? ({ tabIndex: -1, "data-section-heading": "" } as const)
    : {};
  return (
    <>
      <h2 {...focus} className={cn(BASE, "lg:hidden")}>
        {children}
      </h2>
      <h3 {...focus} className={cn(BASE, "max-lg:hidden")}>
        {children}
      </h3>
    </>
  );
}
