import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

import { assertPanelHost } from "@/lib/api/panel/host";
import { panelOrigin } from "@/lib/panel-config";

import "./panel.css";

// The panel's root segment (ADR-0008): every panel-host path is rewritten
// under it. Panel pages are never indexed (P03.5). The share image (brand
// v1, DDR-0002; panel AC 75) is the panel's only: never on /v/*.
export const metadata: Metadata = {
  title: { template: "%s · Kybr", default: "Kybr" },
  robots: { index: false, follow: false },
  metadataBase: panelOrigin(),
  openGraph: {
    title: "Kybr",
    description: "Verificação de empresas por link.",
    images: [
      {
        url: "/brand/kybr-og-1200x630.png",
        width: 1200,
        height: 630,
        alt: "kybr. Saiba com quem você vende.",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

type Props = {
  children: ReactNode;
};

export default async function PanelLayout({
  children,
}: Props): Promise<JSX.Element> {
  // Middleware isn't a boundary: off the panel host, nothing below renders.
  await assertPanelHost();
  // `isolate` is the panel's CSS sentinel: the link never uses it, so the
  // bundle guard fails if it reaches a /v/* stylesheet (ADR-0010).
  return <div className="isolate">{children}</div>;
}
