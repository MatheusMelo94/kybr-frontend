import type { JSX } from "react";

import { cn } from "@/lib/utils";

type Props = {
  tone: "success" | "neutral";
};

const TONES = {
  success: "bg-success",
  neutral: "bg-ink-muted",
} as const;

/** A decorative dot. Always pair it with text: color is never the only signal. */
export function StatusDot({ tone }: Props): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", TONES[tone])}
    />
  );
}
