import type { JSX, ReactNode } from "react";

import { SellersProvider } from "@/features/panel-sellers/components/sellers-provider";

// Vendedores and the seller detail share the reverify intent keys (plan-m8
// D6, QA Q5). No loading.tsx: the pages stream their own Suspense skeletons
// (the M5 lesson, T83: query-only navigations under a loading boundary
// didn't commit on Next 15.5).
export default function SellersLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <SellersProvider>{children}</SellersProvider>;
}
