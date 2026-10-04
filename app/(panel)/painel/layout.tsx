import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

import "./panel.css";

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
  // `isolate` is the panel's CSS sentinel: the link never uses it, so the
  // bundle guard fails if it reaches a /v/* stylesheet (ADR-0010).
  return <div className="isolate">{children}</div>;
}
