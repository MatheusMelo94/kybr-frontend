"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { FilaAba } from "@/features/panel-fila/search-params";

// The Fila's layout-scoped client state (plan-m6 § 5), kept across the page
// remount of a case switch: the case being opened (the detail skeleton), the
// focus intent (the detail heading after an open) and the list's scroll per
// tab (T99), the optimistic removal of a case being decided and the intent
// Idempotency-Keys (F5, T105). The new-case poll, online state and flashes
// arrive with T106, T110 and T111.

/** /fila's key for the pane (DetailPane's caseId null): case ids are never empty. */
export const FILA_NO_CASE = "";

/** A decision in flight (useOptimistic: it ends with the transition). */
type Removal = { id: string; next: string | null } | null;

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
};

const FilaContext = createContext<FilaValue | null>(null);

export function FilaProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null);
  const [focusIntent, setFocusIntent] = useState<string | null>(null);
  const scroll = useRef(new Map<FilaAba, number>());
  const [removal, setRemoval] = useOptimistic<Removal, Removal>(
    null,
    (_, next) => next,
  );
  const listRef = useRef<ListSnapshot>({ ids: [], query: "" });
  const keys = useRef(new Map<string, string>());

  const openCase = useCallback((id: string) => {
    setPendingCaseId(id);
    setFocusIntent(id);
  }, []);
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
