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

// plan-m8 D6, QA Q5: the reverify Idempotency-Key per (seller, reverify)
// intent, kept by the Vendedores layout so the list and the detail share it
// and a re-read can't lose it. Memory only.

type Keys = {
  keyFor: (sellerId: string) => string;
  drop: (sellerId: string) => void;
};

const SellersContext = createContext<Keys | null>(null);

export function SellersProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const keys = useRef(new Map<string, string>());
  // A drop re-renders the consumers so they read the fresh key.
  const [version, setVersion] = useState(0);

  const keyFor = useCallback((sellerId: string): string => {
    let key = keys.current.get(sellerId);
    if (key === undefined) {
      key = crypto.randomUUID();
      keys.current.set(sellerId, key);
    }
    return key;
  }, []);

  const drop = useCallback((sellerId: string): void => {
    keys.current.delete(sellerId);
    setVersion((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({ keyFor, drop, version }),
    [keyFor, drop, version],
  );
  return (
    <SellersContext.Provider value={value}>{children}</SellersContext.Provider>
  );
}

/** The seller's current intent key, and drop() for a fresh one (a definitive outcome). */
export function useReverifyKey(sellerId: string): {
  key: string;
  drop: () => void;
} {
  const context = useContext(SellersContext);
  if (context === null)
    throw new Error("useReverifyKey needs a SellersProvider");
  return {
    key: context.keyFor(sellerId),
    drop: () => context.drop(sellerId),
  };
}
