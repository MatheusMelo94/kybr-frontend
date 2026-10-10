import type { JSX, ReactNode } from "react";

import { FilaProvider } from "@/features/panel-fila/components/fila-provider";
import { NewCasesPoller } from "@/features/panel-fila/components/new-cases-poller";
import { FilaOfflineBanner } from "@/features/panel-fila/components/offline-banner";

// The Fila's client state lives here, above both pages, so it survives the
// navigation between /fila and /fila/{id} (plan-m6 § 5). No loading.tsx: the
// pages stream their own Suspense skeletons (the M5 lesson, T83). renderedAt
// moves on every server render: the proof a re-read took (T106). The
// new-case poll is a layout leaf, so both pages own its action (T110).
export default function FilaLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <FilaProvider renderedAt={Date.now()}>
      <NewCasesPoller />
      <FilaOfflineBanner />
      {children}
    </FilaProvider>
  );
}
