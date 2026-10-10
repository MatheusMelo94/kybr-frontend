"use client";

import { useEffect, useRef, type JSX } from "react";

import { Notice } from "@/components/panel/notice";
import { useToast } from "@/components/panel/toast";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { fill, formatHora } from "@/features/panel-shell/format";

type Props = {
  /** The page's online state (useOnline(), plus any hint the page keeps). */
  online: boolean;
  /** When the server last rendered the page (epoch ms): offline.panel's {hora}. */
  renderedAt: number;
  /** Back online: the page re-reads (once per return). */
  onReconnect: () => void;
};

/**
 * Offline (T111, AC 44 / AC 51, D8; ADR-0011 rule 8): the rendered tree
 * stays, with offline.panel and the last server render's time. On
 * reconnect: onReconnect() once and offline.back (a polite toast). Nothing
 * else is retried (F14). Promoted from the Fila (T125); it takes props
 * only, never page data (Security A-F1).
 */
export function OfflineBanner({
  online,
  renderedAt,
  onReconnect,
}: Props): JSX.Element {
  const { show } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    onReconnect();
    show(globalCopy["offline.back"]);
  }, [online, onReconnect, show]);

  // The status region is present at first paint and only its content
  // switches: a region inserted with its text is often not announced
  // (P6-004; plan § 8).
  return (
    <div data-offline-banner role="status">
      {!online && (
        <Notice role="none" tone="warning" className="tabular-nums">
          {fill(globalCopy["offline.panel"], { hora: formatHora(renderedAt) })}
        </Notice>
      )}
    </div>
  );
}
