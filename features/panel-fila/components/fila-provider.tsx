"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { FilaAba } from "@/features/panel-fila/search-params";

// The Fila's layout-scoped client state (plan-m6 § 5), kept across the page
// remount of a case switch: the case being opened (the detail skeleton), the
// focus intent (the detail heading after an open) and the list's scroll per
// tab (T99). The optimistic removals, intent keys (F5), the new-case poll,
// online state and flashes arrive with T105, T110 and T111.

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

  const value = useMemo<FilaValue>(
    () => ({
      pendingCaseId,
      focusIntent,
      openCase,
      focusCase: setFocusIntent,
      settle,
      saveScroll,
      takeScroll,
    }),
    [pendingCaseId, focusIntent, openCase, settle, saveScroll, takeScroll],
  );
  return <FilaContext.Provider value={value}>{children}</FilaContext.Provider>;
}

/** The Fila's state; only inside fila/layout.tsx. */
export function useFila(): FilaValue {
  const value = useContext(FilaContext);
  if (value === null) throw new Error("useFila outside FilaProvider");
  return value;
}
