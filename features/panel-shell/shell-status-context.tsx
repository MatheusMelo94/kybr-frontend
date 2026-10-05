"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { Contagens, Plano } from "@/lib/api/schemas/panel/me";

// The shell's polled projection (plan § 3.1): counts and plan, seeded by the
// server's /me and refreshed by ShellStatusPoller. Scoped to the (app)
// layout (ADR-0010 rule 4). It never holds a copy of a list.

type Status = { contagens: Contagens | undefined; plano: Plano | undefined };

type Value = Status & {
  /** contagens.lote_em_andamento: the Lote item's nav.lote.running (rendered once M5 adds it). */
  loteRunning: boolean;
  update: (next: Status) => void;
};

const ShellStatusContext = createContext<Value | null>(null);

type Props = {
  initial: Status;
  children: ReactNode;
};

export function ShellStatusProvider({ initial, children }: Props): JSX.Element {
  const [status, setStatus] = useState<Status>(initial);
  const value = useMemo<Value>(
    () => ({
      ...status,
      loteRunning: status.contagens?.lote_em_andamento ?? false,
      update: setStatus,
    }),
    [status],
  );
  return (
    <ShellStatusContext.Provider value={value}>
      {children}
    </ShellStatusContext.Provider>
  );
}

export function useShellStatus(): Value {
  const value = useContext(ShellStatusContext);
  if (value === null)
    throw new Error("useShellStatus outside ShellStatusProvider");
  return value;
}
