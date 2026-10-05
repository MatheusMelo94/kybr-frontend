import type { JSX, ReactNode, Ref } from "react";

import { NOTICE_BASE, NOTICE_TONES } from "@/components/panel/notice-styles";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /**
   * "status" is polite; "alert" interrupts (only for what needs action now);
   * "none" is no live region, for a banner read in place (T66's PlanBanner).
   */
  role?: "status" | "alert" | "none";
  /** The text carries the meaning, in ink; warning and danger add a coloured left bar (DDR-0003). */
  tone?: "info" | "warning" | "danger";
  /** Lets a client leaf move focus here (tabIndex -1), e.g. a banner read on load. */
  focusable?: boolean;
  id?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** A banner: a status or alert message above a form or a screen. */
export function Notice({
  children,
  role = "status",
  tone = "info",
  focusable = false,
  id,
  className,
  ref,
}: Props): JSX.Element {
  return (
    <div
      ref={ref}
      id={id}
      role={role === "none" ? undefined : role}
      tabIndex={focusable ? -1 : undefined}
      className={cn(NOTICE_BASE, NOTICE_TONES[tone], className)}
    >
      {children}
    </div>
  );
}
