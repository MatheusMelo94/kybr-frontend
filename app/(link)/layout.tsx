import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

import { LinkColumn } from "@/features/seller-link/components/link-column";

// Capability URLs: never indexed (threat model F06). No favicon on the link (AC 1).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  children: ReactNode;
};

export default function LinkLayout({ children }: Props): JSX.Element {
  return <LinkColumn>{children}</LinkColumn>;
}
