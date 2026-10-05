"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type JSX,
  type ReactNode,
} from "react";

type Value = {
  /** BatchProgress records, when the poll sees the end, whether focus was inside it. */
  record: (inside: boolean) => void;
  /** The result reads it once (T82): focus moves to its heading only if so. */
  wasInProgress: () => boolean;
};

const BatchFocusContext = createContext<Value | null>(null);

/**
 * /lote/[batchId]'s layout keeps one fact across router.refresh() (plan M5
 * accessibility mechanics): whether focus was in the progress region when
 * the batch ended. A ref, not state: nothing re-renders for it.
 */
export function BatchFocusKeeper({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const inside = useRef(false);
  const value = useMemo<Value>(
    () => ({
      record: (wasInside) => {
        inside.current = wasInside;
      },
      wasInProgress: () => inside.current,
    }),
    [],
  );
  return (
    <BatchFocusContext.Provider value={value}>
      {children}
    </BatchFocusContext.Provider>
  );
}

const NONE: Value = { record: () => undefined, wasInProgress: () => false };

export function useBatchFocus(): Value {
  return useContext(BatchFocusContext) ?? NONE;
}
