"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";

// The Fila's layout-scoped client state (plan-m6 § 5): the optimistic
// removals, the intent keys (F5), the new-case poll, online state, flashes
// and focus intents arrive with T99, T105, T110 and T111. Until then the
// provider only marks the Fila's subtree.

type FilaValue = { readonly inFila: true };

const FilaContext = createContext<FilaValue | null>(null);

const VALUE: FilaValue = { inFila: true };

export function FilaProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <FilaContext.Provider value={VALUE}>{children}</FilaContext.Provider>;
}

/** The Fila's state; only inside fila/layout.tsx. */
export function useFila(): FilaValue {
  const value = useContext(FilaContext);
  if (value === null) throw new Error("useFila outside FilaProvider");
  return value;
}
