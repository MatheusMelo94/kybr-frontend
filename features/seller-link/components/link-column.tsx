import type { JSX, ReactNode } from "react";

import { KybrFooter } from "@/features/seller-link/components/kybr-footer";
import { LinkMain } from "@/features/seller-link/components/link-main";

type Props = {
  children: ReactNode;
};

/**
 * The link's single centered column, at most 480 px at every breakpoint (spec
 * § Screens & Surfaces). Centered on purpose: it's a single-task flow. Wide
 * screens get the same column, lower on the page: 64 px from 768, 96 px from
 * 1024 (user decision, 2026-10-04: 768 and 1280 are first-class). Every
 * screen ends with the Kybr footer (link AC 40), outside main.
 */
export function LinkColumn({ children }: Props): JSX.Element {
  // At least a viewport tall before the footer, so it starts below the first
  // screen: a screen whose height changes after it paints (skeleton → form,
  // verificando → result) can't move it inside the viewport (CLS 0, AC 2 /
  // AC 32).
  return (
    <>
      <div className="min-h-dvh">
        <LinkMain>{children}</LinkMain>
      </div>
      <KybrFooter />
    </>
  );
}
