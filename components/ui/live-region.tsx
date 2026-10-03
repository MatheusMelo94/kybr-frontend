import type { JSX, ReactNode } from "react";

type Props = {
  /** The message. Keep the region mounted and change only this, so it's announced. */
  children?: ReactNode;
  /** "polite" waits for the reader to pause; "alert" interrupts (errors that need action). */
  politeness?: "polite" | "alert";
  className?: string;
};

export function LiveRegion({
  children,
  politeness = "polite",
  className,
}: Props): JSX.Element {
  if (politeness === "alert") {
    return (
      <div role="alert" className={className}>
        {children}
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={className}
    >
      {children}
    </div>
  );
}
