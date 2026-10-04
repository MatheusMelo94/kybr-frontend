import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

// The panel's root segment (ADR-0008): every panel-host path is rewritten
// under it. Panel pages are never indexed (P03.5).
export const metadata: Metadata = {
  title: { template: "%s · Kybr", default: "Kybr" },
  robots: { index: false, follow: false },
};

type Props = {
  children: ReactNode;
};

export default function PanelLayout({ children }: Props): JSX.Element {
  return <>{children}</>;
}
