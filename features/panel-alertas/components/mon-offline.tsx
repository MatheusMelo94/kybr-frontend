"use client";

import { useCallback, useEffect, useRef, type JSX } from "react";

import { OfflineBanner } from "@/components/panel/offline-banner";
import { useNavigationGuard } from "@/lib/navigation/navigation-guard";
import { useRefreshUntil } from "@/lib/navigation/refresh-until";
import { useOnline } from "@/lib/use-online";

/**
 * The Monitoramento's offline state (AC 51): the shared banner, and on
 * reconnect one re-read that refreshes until a new server render lands
 * (renderedAt changes). The re-read is guarded (plan-m6 § 18): a navigation
 * away, a newer soft navigation or an unmount ends it.
 */
export function MonOffline({
  renderedAt,
}: {
  renderedAt: number;
}): JSX.Element {
  const online = useOnline();
  const rendered = useRef(renderedAt);
  const from = useRef(renderedAt);
  const guard = useRef<ReturnType<ReturnType<typeof useNavigationGuard>>>(null);
  const arm = useNavigationGuard();

  useEffect(() => {
    rendered.current = renderedAt;
  }, [renderedAt]);

  const refreshUntil = useRefreshUntil(
    useCallback(
      () =>
        rendered.current !== from.current ||
        guard.current?.stillHere() === false,
      [],
    ),
  );
  const reread = useCallback(() => {
    if (!navigator.onLine) return;
    from.current = rendered.current;
    guard.current = arm();
    refreshUntil();
  }, [arm, refreshUntil]);

  return (
    <OfflineBanner
      online={online}
      renderedAt={renderedAt}
      onReconnect={reread}
    />
  );
}
