"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { FilaAba } from "@/features/panel-fila/search-params";
import { useRefreshUntil } from "@/lib/navigation/refresh-until";

// The Fila's layout-scoped client state (plan-m6 § 5), kept across the page
// remount of a case switch: the case being opened (the detail skeleton), the
// focus intent (the detail heading after an open) and the list's scroll per
// tab (T99), the optimistic removal of a case being decided and the intent
// Idempotency-Keys (F5, T105), the decide flashes, the offline hint and the
// re-read after a failed decision (T106). The new-case poll and the online
// state arrive with T110 and T111.

/** /fila's key for the pane (DetailPane's caseId null): case ids are never empty. */
export const FILA_NO_CASE = "";

/** A decision in flight (useOptimistic: it ends with the transition). */
type Removal = { id: string; next: string | null } | null;

/**
 * A decision's outcome shown on its case (plan-m6 § 3.3): decide-error
 * (a failure or an unknown outcome) or conflict (a 409, decided elsewhere).
 */
export type Flash =
  | { kind: "decide-error" }
  | { kind: "conflict"; decididoEm: string | undefined };

/** The list as rendered: its ids in order and its ?aba=&ate= (the next case, D5). */
type ListSnapshot = { ids: readonly string[]; query: string };

type FilaValue = {
  /** A case the user opened that hasn't rendered yet (DetailPane's skeleton). */
  pendingCaseId: string | null;
  /** The case whose heading takes focus when it renders. */
  focusIntent: string | null;
  /** Opening `id`: its skeleton until it renders, then focus on its heading. */
  openCase: (id: string) => void;
  /** Focus `id`'s heading (it is already open). */
  focusCase: (id: string) => void;
  /** The case rendered (pending and focus intent are done with). */
  settle: (what: "pending" | "focus") => void;
  /** The list's window scroll for a tab, kept until the list remounts once. */
  saveScroll: (aba: FilaAba, y: number) => void;
  takeScroll: (aba: FilaAba) => number | undefined;
  /** The case being decided (hidden from the list) and the next one (selected). */
  removal: Removal;
  /** Inside a transition: hide `id` and select `next` until it ends. */
  setRemoval: (removal: Removal) => void;
  /** CaseListbox reports what it rendered. */
  reportList: (snapshot: ListSnapshot) => void;
  list: () => ListSnapshot;
  /**
   * F5: one Idempotency-Key per intent (caseId, action, body), here in the
   * layout so the re-read remount after an unknown outcome keeps it.
   */
  intentKey: (intent: string) => string;
  /** After a definitive result (ok, 409, a 4xx) or a changed body. */
  releaseKey: (intent: string) => void;
  /** R1: the cases decided in this session, never a "next" case (a lagging list may still show them). */
  markDecided: (id: string) => void;
  wasDecided: (id: string) => boolean;
  /** The flash per case: until the case is opened again or decided. */
  flash: Readonly<Record<string, Flash>>;
  setFlash: (id: string, flash: Flash | null) => void;
  /** A decision's call didn't get through (NETWORK); T111 reads it. */
  offlineHint: boolean;
  hintOffline: () => void;
  /** Re-read the current page until the server re-renders it (renderedAt). */
  reread: () => void;
};

const FilaContext = createContext<FilaValue | null>(null);

type Props = {
  /** The layout's render time: it changes when the server re-renders (a refresh). */
  renderedAt: number;
  children: ReactNode;
};

export function FilaProvider({ renderedAt, children }: Props): JSX.Element {
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null);
  const [focusIntent, setFocusIntent] = useState<string | null>(null);
  const scroll = useRef(new Map<FilaAba, number>());
  const [removal, setRemoval] = useOptimistic<Removal, Removal>(
    null,
    (_, next) => next,
  );
  const listRef = useRef<ListSnapshot>({ ids: [], query: "" });
  const keys = useRef(new Map<string, string>());
  const decided = useRef(new Set<string>());
  const [flash, setFlashes] = useState<Readonly<Record<string, Flash>>>({});
  const [offlineHint, setOfflineHint] = useState(false);
  const rendered = useRef(renderedAt);
  const rereadFrom = useRef(renderedAt);

  useEffect(() => {
    rendered.current = renderedAt;
  }, [renderedAt]);

  const setFlash = useCallback((id: string, next: Flash | null) => {
    setFlashes((current) => {
      if (next !== null) return { ...current, [id]: next };
      if (!(id in current)) return current;
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
  }, []);
  const hintOffline = useCallback(() => setOfflineHint(true), []);
  const refreshUntilRendered = useRefreshUntil(
    useCallback(() => rendered.current !== rereadFrom.current, []),
  );
  const reread = useCallback(() => {
    rereadFrom.current = rendered.current;
    refreshUntilRendered();
  }, [refreshUntilRendered]);

  const openCase = useCallback(
    (id: string) => {
      setPendingCaseId(id);
      setFocusIntent(id);
      setFlash(id, null);
    },
    [setFlash],
  );
  const settle = useCallback((what: "pending" | "focus") => {
    if (what === "pending") setPendingCaseId(null);
    else setFocusIntent(null);
  }, []);
  const saveScroll = useCallback((aba: FilaAba, y: number) => {
    scroll.current.set(aba, y);
  }, []);
  const takeScroll = useCallback((aba: FilaAba) => {
    const y = scroll.current.get(aba);
    scroll.current.delete(aba);
    return y;
  }, []);

  const reportList = useCallback((snapshot: ListSnapshot) => {
    listRef.current = snapshot;
  }, []);
  const list = useCallback(() => listRef.current, []);
  const intentKey = useCallback((intent: string) => {
    let key = keys.current.get(intent);
    if (key === undefined) {
      key = crypto.randomUUID();
      keys.current.set(intent, key);
    }
    return key;
  }, []);
  const releaseKey = useCallback((intent: string) => {
    keys.current.delete(intent);
  }, []);

  const markDecided = useCallback((id: string) => {
    decided.current.add(id);
  }, []);
  const wasDecided = useCallback((id: string) => decided.current.has(id), []);

  const value = useMemo<FilaValue>(
    () => ({
      pendingCaseId,
      focusIntent,
      openCase,
      focusCase: setFocusIntent,
      settle,
      saveScroll,
      takeScroll,
      removal,
      setRemoval,
      reportList,
      list,
      intentKey,
      releaseKey,
      markDecided,
      wasDecided,
      flash,
      setFlash,
      offlineHint,
      hintOffline,
      reread,
    }),
    [
      pendingCaseId,
      focusIntent,
      openCase,
      settle,
      saveScroll,
      takeScroll,
      removal,
      setRemoval,
      reportList,
      list,
      intentKey,
      releaseKey,
      markDecided,
      wasDecided,
      flash,
      setFlash,
      offlineHint,
      hintOffline,
      reread,
    ],
  );
  return <FilaContext.Provider value={value}>{children}</FilaContext.Provider>;
}

/** The Fila's state; only inside fila/layout.tsx. */
export function useFila(): FilaValue {
  const value = useContext(FilaContext);
  if (value === null) throw new Error("useFila outside FilaProvider");
  return value;
}
