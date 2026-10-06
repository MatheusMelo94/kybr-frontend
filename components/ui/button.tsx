import type { JSX, MouseEvent, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  variant?: "primary" | "secondary";
  /** "panel": the panel's 40 px control, still 44 px on coarse pointers (plan § 2.6). */
  size?: "default" | "panel";
  type?: "button" | "submit";
  /** Pending async work: shows `busyLabel`, keeps the width, ignores presses. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean | undefined;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  id?: string;
  "aria-describedby"?: string | undefined;
  ref?: Ref<HTMLButtonElement>;
};

const BASE =
  "inline-flex items-center justify-center rounded-full px-6 text-body font-strong " +
  "transition-colors duration-(--duration-fast) ease-out-quart motion-reduce:transition-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "aria-busy:cursor-progress " +
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-field disabled:text-ink-muted";

const VARIANTS = {
  primary:
    "h-12 bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80",
  secondary:
    "min-h-11 border border-field-line bg-transparent text-ink hover:bg-surface-raised active:bg-field",
} as const;

// The panel's height replaces the link's (cn() resolves the h-/min-h- conflict).
const PANEL_SIZE = {
  primary: "h-(--size-control-panel) pointer-coarse:h-11",
  secondary: "min-h-(--size-control-panel) pointer-coarse:min-h-11",
} as const;

// Busy stays focusable (aria-disabled, not `disabled`), so keyboard focus isn't
// dropped mid-submit. Cancelling the click also cancels the form submission it
// would trigger, including implicit submission from Enter in a field.
function ignorePress(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

export function Button({
  children,
  variant = "primary",
  size = "default",
  type = "button",
  busy = false,
  busyLabel,
  disabled,
  onClick,
  className,
  id,
  "aria-describedby": describedBy,
  ref,
}: Props): JSX.Element {
  const showBusyLabel = busy && busyLabel !== undefined;

  return (
    <button
      ref={ref}
      id={id}
      type={type}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      aria-describedby={describedBy}
      onClick={busy ? ignorePress : onClick}
      className={cn(
        BASE,
        VARIANTS[variant],
        size === "panel" && PANEL_SIZE[variant],
        className,
      )}
    >
      {/* Both labels share one grid cell, so the button is as wide as the longer one. */}
      <span className="grid">
        <span
          aria-hidden={showBusyLabel || undefined}
          className={cn(
            "col-start-1 row-start-1",
            showBusyLabel && "invisible",
          )}
        >
          {children}
        </span>
        {busyLabel !== undefined && (
          <span
            aria-hidden={!showBusyLabel || undefined}
            className={cn(
              "col-start-1 row-start-1",
              !showBusyLabel && "invisible",
            )}
          >
            {busyLabel}
          </span>
        )}
      </span>
    </button>
  );
}
