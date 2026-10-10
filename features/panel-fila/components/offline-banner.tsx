"use client";

import type { JSX } from "react";

import { OfflineBanner } from "@/components/panel/offline-banner";
import { useFila } from "@/features/panel-fila/components/fila-provider";

/**
 * The Fila's offline banner (T111): the shared OfflineBanner fed by the
 * Fila's provider (its online state includes a decision's NETWORK hint; on
 * reconnect it re-reads). F10 (accepted residual): that re-read is a full
 * render without the poll header, so it slides the idle session; it's
 * bounded to one per return.
 */
export function FilaOfflineBanner(): JSX.Element {
  const { online, renderedAt, reread } = useFila();
  return (
    <OfflineBanner
      online={online}
      renderedAt={renderedAt}
      onReconnect={reread}
    />
  );
}
