import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

import { LinkColumn } from "@/features/seller-link/components/link-column";

import "./link.css";

// Capability URLs: never indexed (threat model F06), and no share image
// (DDR-0002 Decision 4). The icons come from the root layout (AC 41).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  children: ReactNode;
};

export default function LinkLayout({ children }: Props): JSX.Element {
  return <LinkColumn>{children}</LinkColumn>;
}
