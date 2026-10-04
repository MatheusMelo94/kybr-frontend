import type { JSX, ReactNode } from "react";

type Props = {
  /** The message. Keep the region mounted and change only this, so it's announced. */
  children?: ReactNode;
  /** "polite" waits for the reader to pause; "alert" interrupts (errors that need action). */
  politeness?: "polite" | "alert";
  /** Lets a control name the message in its aria-describedby. */
  id?: string;
  className?: string;
};

export function LiveRegion({
  children,
  politeness = "polite",
  id,
  className,
}: Props): JSX.Element {
  if (politeness === "alert") {
    return (
      <div id={id} role="alert" className={className}>
        {children}
      </div>
    );
  }
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={className}
    >
      {children}
    </div>
  );
}
