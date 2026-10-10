"use client";

import { useEffect, useRef, type JSX } from "react";

import { Notice } from "@/components/panel/notice";
import { useToast } from "@/components/panel/toast";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { formatHora } from "@/features/panel-shell/format";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill } from "@/features/panel-shell/format";

/**
 * Offline (T111, AC 44, D8; ADR-0011 rule 8): the rendered tree stays, with
 * offline.panel and the last server render's time. On reconnect: one
 * re-read and offline.back (a polite toast). Nothing else is retried (F14).
 * F10 (accepted residual): that re-read is a full render without the poll
 * header, so it slides the idle session; it's bounded to one per return.
 */
export function OfflineBanner(): JSX.Element {
  const { online, renderedAt, reread } = useFila();
  const { show } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    reread();
    show(globalCopy["offline.back"]);
  }, [online, reread, show]);

  // The status region is present at first paint and only its content
  // switches: a region inserted with its text is often not announced
  // (P6-004; plan § 8).
  return (
    <div data-fila-offline role="status">
      {!online && (
        <Notice role="none" tone="warning" className="tabular-nums">
          {fill(globalCopy["offline.panel"], { hora: formatHora(renderedAt) })}
        </Notice>
      )}
    </div>
  );
}
