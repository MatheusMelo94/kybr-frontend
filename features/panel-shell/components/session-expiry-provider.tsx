"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type JSX,
  type ReactNode,
} from "react";

// Knows, for the session-expiry path, whether a dialog holds unsent input
// (AC 7's perdido=1; the first real dialog arrives in M6), and makes sure the
// expiry navigates only once. Lives in the (app) shell (ADR-0010 rule 4).

type Value = {
  setDraft: (key: string, dirty: boolean) => void;
  hasUnsentInput: () => boolean;
  /** True the first time only: the caller navigates; everyone after doesn't. */
  claimExpiry: () => boolean;
};

export const SessionExpiryContext = createContext<Value | null>(null);

type Props = {
  children: ReactNode;
};

export function SessionExpiryProvider({ children }: Props): JSX.Element {
  const drafts = useRef(new Set<string>());
  const expired = useRef(false);
  const value = useMemo<Value>(
    () => ({
      setDraft: (key, dirty) => {
        if (dirty) drafts.current.add(key);
        else drafts.current.delete(key);
      },
      hasUnsentInput: () => drafts.current.size > 0,
      claimExpiry: () => {
        if (expired.current) return false;
        expired.current = true;
        return true;
      },
    }),
    [],
  );
  return (
    <SessionExpiryContext.Provider value={value}>
      {children}
    </SessionExpiryContext.Provider>
  );
}

/** A dialog reports whether it holds unsent input (cleared on unmount). */
export function useDialogDraft(dirty: boolean): void {
  const context = useContext(SessionExpiryContext);
  const key = useId();
  useEffect(() => {
    context?.setDraft(key, dirty);
    return () => context?.setDraft(key, false);
  }, [context, key, dirty]);
}
