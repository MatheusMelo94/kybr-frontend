"use client";

import type { JSX } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Visible label: the switch's accessible name. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Ids of messages that describe it (an error elsewhere on the form). */
  describedBy?: string | undefined;
  className?: string;
};

/**
 * An on/off toggle (spec § Accessibility Acceptance › Toggles; plan-m8 § 5):
 * a native button with role="switch" and aria-checked, named by its visible
 * label, so Space and Enter flip it. The row is ≥ 44 px on coarse pointers;
 * the thumb slides at --duration-fast (transform only), instantly under
 * reduced motion.
 */
export function Switch({
  label,
  checked,
  onChange,
  describedBy,
  className,
}: Props): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-6 w-full items-center justify-between gap-4 text-left text-secondary text-ink pointer-coarse:min-h-11",
        "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      <span className="min-w-0 break-words">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border",
          checked ? "border-transparent bg-ink" : "border-field-line bg-field",
        )}
      >
        <span
          data-switch-thumb
          className={cn(
            "size-4 rounded-full transition-transform duration-(--duration-fast) ease-out-quart motion-reduce:transition-none",
            checked ? "translate-x-5 bg-surface" : "translate-x-1 bg-ink-muted",
          )}
        />
      </span>
    </button>
  );
}
