"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDialogDraft } from "@/features/panel-shell/components/session-expiry-provider";
import { setLeaveHolder } from "@/lib/navigation/leave-hold";
import { useSoftNavigate } from "@/lib/navigation/soft-navigate";

/**
 * The href a dirty form holds back, or null to let the click through
 * (Security O-F9): only an unmodified left-click on a same-origin link that
 * isn't a download, doesn't open elsewhere and goes to another page (an
 * in-page #hash, like the skip link, passes).
 */
export function guardedHref(
  event: MouseEvent,
  anchor: HTMLAnchorElement,
  origin: string,
): string | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return null;
  if (anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target !== null && target !== "" && target !== "_self") return null;
  const href = anchor.getAttribute("href");
  if (href === null) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== origin) return null;
  const here = window.location;
  if (
    url.pathname === here.pathname &&
    url.search === here.search &&
    url.hash !== ""
  )
    return null;
  return url.pathname + url.search + url.hash;
}

/**
 * Regras' leave guard (plan-m8 D8, AC 7, Q3), armed while `dirty`:
 * - a capture-phase click guard on same-origin links (the nav, the account
 *   menu, in-page links) holds the href for the regras.leave.* dialog:
 *   `stay` drops it, `leave` disarms and navigates there softly;
 * - a leave holder (lib/navigation/leave-hold) does the same for the
 *   account menu's Sair (P8-005): its server redirect is a soft navigation
 *   beforeunload never sees; `leave` runs the held sign-out;
 * - beforeunload asks the browser's own prompt on reload or close;
 * - useDialogDraft: a session expiry says the draft was lost (perdido=1).
 * The browser's Back button is NOT intercepted (Q3): the App Router can't
 * block a popstate cleanly, and a sentinel history entry is fragile.
 */
/** What the dialog holds back: a link's href, or an action to run (Sair). */
type Held = string | (() => void);

export function useLeaveGuard(dirty: boolean): {
  pending: Held | null;
  stay: () => void;
  leave: () => void;
  /** Lets the next navigation or reload through (a reload link, a save). */
  disarm: () => void;
} {
  const [pending, setPending] = useState<Held | null>(null);
  const armed = useRef(dirty);
  const navigate = useSoftNavigate();

  useDialogDraft(dirty);

  useEffect(() => {
    armed.current = dirty;
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (!armed.current) return;
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (anchor === null) return;
      const href = guardedHref(event, anchor, window.location.origin);
      if (href === null) return;
      // Capture on document runs before React's root listener: Next's Link
      // never sees the click.
      event.preventDefault();
      event.stopPropagation();
      setPending(href);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!armed.current) return;
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    // A function in state needs the updater form.
    setLeaveHolder((proceed) => {
      if (!armed.current) return false;
      setPending(() => proceed);
      return true;
    });
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      setLeaveHolder(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  const stay = useCallback(() => setPending(null), []);
  const disarm = useCallback(() => {
    armed.current = false;
  }, []);
  const leave = useCallback(() => {
    if (pending === null) return;
    armed.current = false;
    setPending(null);
    if (typeof pending === "string")
      navigate(pending, { push: true, scroll: true });
    else pending();
  }, [navigate, pending]);

  return { pending, stay, leave, disarm };
}
