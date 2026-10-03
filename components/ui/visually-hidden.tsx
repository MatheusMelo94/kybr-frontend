import type { JSX, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Text for assistive technology only. */
export function VisuallyHidden({ children }: Props): JSX.Element {
  return <span className="sr-only">{children}</span>;
}
