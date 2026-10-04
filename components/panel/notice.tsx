import type { JSX, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** "status" is polite; "alert" interrupts (only for what needs action now). */
  role?: "status" | "alert";
  /** The text carries the meaning; the tone only adds the matching ink. */
  tone?: "info" | "warning" | "danger";
  /** Lets a client leaf move focus here (tabIndex -1), e.g. a banner read on load. */
  focusable?: boolean;
  id?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

const TONES = {
  info: "border-line text-ink",
  warning: "border-line text-warning-ink",
  danger: "border-line text-danger-ink",
} as const;

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
      role={role}
      tabIndex={focusable ? -1 : undefined}
      className={cn(
        "rounded-lg border bg-surface-raised px-4 py-3 text-secondary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        TONES[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
