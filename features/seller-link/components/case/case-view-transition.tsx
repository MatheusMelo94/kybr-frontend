"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { LiveRegion } from "@/components/ui/live-region";
import type { CaseViewKey } from "@/features/seller-link/types";

type AnnounceViewChange = (viewKey: CaseViewKey, announcement: string) => void;

// Scoped to the case screen (plan § 6), not app/providers.tsx.
const ViewChangeContext = createContext<AnnounceViewChange>(() => {});

/** For CaseLiveStatus: report a view the client showed on its own (the 10 s switch). */
export function useAnnounceViewChange(): AnnounceViewChange {
  return use(ViewChangeContext);
}

type Shown = { viewKey: CaseViewKey; announcement: string };

type Props = {
  /** The view the server rendered. */
  viewKey: CaseViewKey;
  /** What the polite region says for it (caseAnnouncement, on the server). */
  announcement: string;
  children: ReactNode;
};

/**
 * Persists across router.refresh() and owns the case page's focus and
 * announcements (plan § 9; tech-design § 3 rule 3). On mount and whenever the
 * view on screen changes, it focuses the view's h1[tabIndex=-1] and puts the
 * view's announcement in a polite region, one frame later so it's never part
 * of the initial render. The view on screen changes when the server sends a
 * new viewKey or when CaseLiveStatus reports its client switch; a key already
 * on screen never re-focuses.
 */
export function CaseViewTransition({
  viewKey,
  announcement,
  children,
}: Props): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown>({ viewKey, announcement });
  const [serverKey, setServerKey] = useState(viewKey);
  const [message, setMessage] = useState("");

  // A new key from the server replaces the view on screen, unless the client
  // switch already showed it (adjusting state while rendering, per React).
  if (viewKey !== serverKey) {
    setServerKey(viewKey);
    if (viewKey !== shown.viewKey) setShown({ viewKey, announcement });
  }

  const announceViewChange = useCallback<AnnounceViewChange>((next, text) => {
    setShown((current) =>
      current.viewKey === next
        ? current
        : { viewKey: next, announcement: text },
    );
  }, []);

  useEffect(() => {
    container.current?.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus();
    const frame = requestAnimationFrame(() => setMessage(shown.announcement));
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  return (
    <ViewChangeContext value={announceViewChange}>
      <LiveRegion className="sr-only">{message}</LiveRegion>
      <div ref={container}>{children}</div>
    </ViewChangeContext>
  );
}
