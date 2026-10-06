"use client";

import type { JSX, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** Unavailable stays focusable (aria-disabled) and explains itself via aria-describedby. */
  unavailable?: boolean;
  busy?: boolean;
  onClick: () => void;
  "aria-describedby"?: string | undefined;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Lote's primary CTA (T79): the panel Button's look, but an unavailable CTA
 * keeps its focus and its reason (spec § Accessibility Acceptance › J3) instead
 * of `disabled`. The link's Button stays untouched (/v/* unchanged).
 */
export function StartButton({
  children,
  unavailable = false,
  busy = false,
  onClick,
  "aria-describedby": describedBy,
  ref,
}: Props): JSX.Element {
  const inert = unavailable || busy;
  return (
    <button
      ref={ref}
      type="button"
      aria-disabled={inert || undefined}
      aria-busy={busy || undefined}
      aria-describedby={describedBy}
      onClick={(event) => {
        if (inert) event.preventDefault();
        else onClick();
      }}
      className={cn(
        // tabular-nums: the label carries the count (AC 76).
        "inline-flex h-(--size-control-panel) items-center justify-center rounded-full bg-accent px-6 text-body font-strong text-accent-ink tabular-nums",
        "transition-colors duration-(--duration-fast) ease-out-quart motion-reduce:transition-none",
        "hover:bg-accent/90 active:bg-accent/80",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "aria-busy:cursor-progress",
        "aria-disabled:cursor-not-allowed aria-disabled:bg-field aria-disabled:text-ink-muted aria-disabled:hover:bg-field",
        "pointer-coarse:h-11",
      )}
    >
      {children}
    </button>
  );
}
