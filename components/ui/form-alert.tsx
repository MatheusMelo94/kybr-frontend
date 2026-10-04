import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** The form-level message (it may hold links). Empty keeps the region mounted. */
  children?: ReactNode;
  id?: string;
  className?: string;
};

/**
 * A form's error region (§ Forms & Validation: role="alert"). Keep it
 * mounted and change only its content, so each new message is announced.
 */
export function FormAlert({ children, id, className }: Props): JSX.Element {
  return (
    <div
      id={id}
      role="alert"
      className={cn("text-secondary text-danger-ink", className)}
    >
      {children}
    </div>
  );
}
