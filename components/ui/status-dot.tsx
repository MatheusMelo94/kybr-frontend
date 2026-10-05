import type { JSX } from "react";

import { cn } from "@/lib/utils";

export type StatusTone =
  "success" | "warning" | "danger" | "monitor" | "neutral";

type Props = {
  tone: StatusTone;
};

// Brand v1 (DDR-0003): green, amber and red are answers; blue is monitoring.
const TONES: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  monitor: "bg-monitor",
  neutral: "bg-ink-muted",
};

/** A decorative dot. Always pair it with text: color is never the only signal. */
export function StatusDot({ tone }: Props): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", TONES[tone])}
    />
  );
}
