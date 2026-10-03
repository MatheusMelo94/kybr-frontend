import type { JSX } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Sizes the block to match the final layout (same heights → zero CLS). */
  className?: string;
};

/** A static placeholder block. It doesn't pulse: the spec allows no other motion. */
export function Skeleton({ className }: Props): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-lg bg-surface-raised", className)}
    />
  );
}
