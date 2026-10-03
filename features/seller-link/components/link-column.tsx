import type { JSX, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * The link's single centered column, at most 480 px at every breakpoint (spec
 * § Screens & Surfaces). Centered on purpose: it's a single-task flow.
 */
export function LinkColumn({ children }: Props): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-link px-4 pt-8 pb-12">
      {children}
    </main>
  );
}
