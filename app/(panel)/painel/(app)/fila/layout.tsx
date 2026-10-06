import type { JSX, ReactNode } from "react";

import { FilaProvider } from "@/features/panel-fila/components/fila-provider";

// The Fila's client state lives here, above both pages, so it survives the
// navigation between /fila and /fila/{id} (plan-m6 § 5). No loading.tsx: the
// pages stream their own Suspense skeletons (the M5 lesson, T83).
export default function FilaLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <FilaProvider>{children}</FilaProvider>;
}
