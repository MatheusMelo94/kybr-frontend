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

function focusHeading(container: HTMLElement | null): void {
  container?.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus();
}

type Props = {
  /** The view the server rendered. */
  viewKey: CaseViewKey;
  /** What the polite region says for it (caseAnnouncement, on the server). */
  announcement: string;
  /** The step indicator: it fills in on a view change, never on first paint (review 0022). */
  step?: ReactNode;
  children: ReactNode;
};

/**
 * Persists across router.refresh() and owns the case page's focus and
 * announcements (plan § 9; tech-design § 3 rule 3). On mount and whenever the
 * view on screen changes, it focuses the view's h1[tabIndex=-1] and puts the
 * view's announcement in a polite region, one frame later so it's never part
 * of the initial render. The view on screen changes when the server sends a
 * new viewKey or when CaseLiveStatus reports its client switch; a key already
 * on screen never re-focuses, except to restore focus that a remount dropped.
 */
export function CaseViewTransition({
  viewKey,
  announcement,
  step,
  children,
}: Props): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown>({ viewKey, announcement });
  const [serverKey, setServerKey] = useState(viewKey);
  // Only a view change fades in: the page's first view never animates (no
  // entrance reveals, spec § Motion Intent).
  const [changed, setChanged] = useState(false);
  const [message, setMessage] = useState("");

  // A new key from the server replaces the view on screen, unless the client
  // switch already showed it (adjusting state while rendering, per React).
  if (viewKey !== serverKey) {
    setServerKey(viewKey);
    setChanged(true);
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
    focusHeading(container.current);
    const frame = requestAnimationFrame(() => setMessage(shown.announcement));
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  // A server view change remounts the view (the keyed wrapper below). When it
  // brings a key the client switch already showed, the focused h1 was just
  // replaced: put focus back on the new one, without announcing again.
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body)
      focusHeading(container.current);
  }, [viewKey]);

  return (
    <ViewChangeContext value={announceViewChange}>
      {step !== undefined && (
        <div data-changed={changed || undefined}>{step}</div>
      )}
      <LiveRegion className="sr-only">{message}</LiveRegion>
      <div ref={container}>
        {/* Keyed by the server's view, so every view change remounts the
            view's client islands (tech-design § 2; § 3 rule 11), and the new
            view crossfades in: opacity only, instant under reduced motion
            (T33; one literal class string, no cn(), for the budget). */}
        <div
          key={viewKey}
          className={
            changed
              ? "transition-opacity duration-(--duration-base) ease-out-quart motion-reduce:transition-none starting:opacity-0"
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </ViewChangeContext>
  );
}
