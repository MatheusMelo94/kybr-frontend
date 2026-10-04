import type { JSX, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * The link's single centered column, at most 480 px at every breakpoint (spec
 * § Screens & Surfaces). Centered on purpose: it's a single-task flow. Wide
 * screens get the same column, lower on the page: 64 px from 768, 96 px from
 * 1024 (user decision, 2026-10-04: 768 and 1280 are first-class).
 */
export function LinkColumn({ children }: Props): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-link px-4 pt-8 pb-12 md:pt-16 lg:pt-24">
      {children}
    </main>
  );
}
